"""Byte-range reads must reproduce the exposure's pixels without reading all of it."""

from io import BytesIO
from unittest.mock import patch

from astropy.io import fits
from astropy.table import Table
from astropy.wcs import WCS
import numpy as np
import pytest
import requests

from app.integrations import irsa_ranges
from app.integrations.http_retry import with_retries
from app.integrations.irsa import ArchiveError, ArchiveTimeout, IrsaClient


URL = "https://irsa.ipac.caltech.edu/ibe/data/spherex/qr3/level2/week/run/3/image.fits"
WIDTH, HEIGHT = 50, 40
PIXEL_DEG = 6.15 / 3600
SIZE_DEG = 2 / 60


def exposure_bytes():
    random = np.random.default_rng(7)
    header = fits.Header()
    header.update({"CTYPE1": "RA---TAN", "CTYPE2": "DEC--TAN", "CRVAL1": 150.0, "CRVAL2": 20.0,
                   "CRPIX1": 25.5, "CRPIX2": 20.5, "CDELT1": -PIXEL_DEG, "CDELT2": PIXEL_DEG,
                   "CUNIT1": "deg", "CUNIT2": "deg", "BUNIT": "MJy/sr", "OBSID": "observation-1"})
    image = random.normal(size=(HEIGHT, WIDTH)).astype(np.float32)
    flags = random.integers(0, 2 ** 22, size=(HEIGHT, WIDTH), dtype=np.int32)
    names = fits.Header({"MSKN0000": "TRANSIENT", "MSKD0000": "Transient detected during SUR",
                         "MSKN0021": "SOURCE", "MSKD0021": "Pixel mapped to a known source"})
    hdus = fits.HDUList([
        fits.PrimaryHDU(header=fits.Header({"DETECTOR": 3})),
        fits.ImageHDU(image, header=header, name="IMAGE"),
        fits.CompImageHDU(flags, header=names, name="FLAGS", compression_type="RICE_1", tile_shape=(1, WIDTH)),
        fits.ImageHDU(np.abs(image) + 1, name="VARIANCE"),
        fits.ImageHDU(image * 0.5, name="ZODI"),
        fits.BinTableHDU(Table({"EPSF": [np.zeros(20000, dtype=np.float32)]}), name="EPSF"),
    ])
    output = BytesIO()
    hdus.writeto(output)
    return output.getvalue(), image, flags


class RangeServer:
    """Stands in for irsa_ranges._request and records the bytes it served."""

    def __init__(self, content):
        self.content, self.requests = content, []

    def __call__(self, url, spec, limit):
        total, parts = len(self.content), []
        for item in spec.split(","):
            first, last = item.split("-")
            parts.append((int(first), self.content[int(first):int(last) + 1]))
        self.requests.append(sum(len(data) for _, data in parts))
        return parts, total


@pytest.fixture(scope="module")
def exposure():
    return exposure_bytes()


@pytest.fixture
def server(exposure, monkeypatch):
    server = RangeServer(exposure[0])
    monkeypatch.setattr(irsa_ranges, "_request", server)
    monkeypatch.setattr(irsa_ranges, "_layouts", type(irsa_ranges._layouts)())
    # A small guess forces the header walk to be exercised.
    monkeypatch.setattr(irsa_ranges, "HEADER_GUESS", 2 * irsa_ranges.BLOCK)
    return server


def window_of(content):
    """Origin of a cutout inside the exposure, from its shifted reference pixel."""
    with fits.open(BytesIO(content)) as hdus:
        header = hdus["IMAGE"].header
        return round(25.5 - header["CRPIX1"]), round(20.5 - header["CRPIX2"]), header["NAXIS1"], header["NAXIS2"]


def test_cutout_holds_only_the_image_window(exposure, server):
    content, image, _ = exposure
    cutout = irsa_ranges.read_cutout(URL, 150.0, 20.0, SIZE_DEG)
    x0, y0, width, height = window_of(cutout)
    with fits.open(BytesIO(cutout)) as hdus, fits.open(BytesIO(content)) as source:
        assert [hdu.name for hdu in hdus] == ["PRIMARY", "IMAGE"]
        assert 18 <= width <= 22 and 18 <= height <= 22
        np.testing.assert_array_equal(hdus["IMAGE"].data, image[y0:y0 + height, x0:x0 + width])
        assert hdus[0].header["DETECTOR"] == 3
        assert hdus["IMAGE"].header["OBSID"] == "observation-1"
        # A pixel keeps its sky position after the window is cut out.
        np.testing.assert_allclose(
            WCS(hdus["IMAGE"].header).pixel_to_world_values(3, 4),
            WCS(source["IMAGE"].header).pixel_to_world_values(3 + x0, 4 + y0), atol=1e-10)
    assert sum(server.requests) < len(content) / 4


def test_planes_share_the_cutout_window(exposure, server):
    _, image, flags = exposure
    x0, y0, width, height = window_of(irsa_ranges.read_cutout(URL, 150.0, 20.0, SIZE_DEG))
    rows, columns = slice(y0, y0 + height), slice(x0, x0 + width)
    expected = {"FLAGS": flags, "ZODI": image * 0.5, "VARIANCE": np.abs(image) + 1}
    for extension, full in expected.items():
        content, plane_width, plane_height = irsa_ranges.read_plane(URL, 150.0, 20.0, SIZE_DEG, extension)
        assert (plane_width, plane_height) == (width, height)
        with fits.open(BytesIO(content)) as hdus:
            np.testing.assert_array_equal(hdus[extension].data, full[rows, columns])
            if extension == "FLAGS":
                # Bit names travel with the plane so it can be interpreted.
                assert hdus[extension].header["MSKN0021"] == "SOURCE"


def test_layout_is_remembered_between_reads(server):
    irsa_ranges.read_cutout(URL, 150.0, 20.0, SIZE_DEG)
    first = len(server.requests)
    irsa_ranges.read_cutout(URL, 150.0, 20.0, SIZE_DEG)
    assert sum(server.requests[first:]) < sum(server.requests[:first]) / 2


def test_window_is_clipped_at_the_edge_and_rejected_outside(exposure, server):
    content, image, _ = exposure
    with fits.open(BytesIO(content)) as source:
        ra, dec = (float(value) for value in WCS(source["IMAGE"].header).pixel_to_world_values(1, 1))
    x0, y0, width, height = window_of(irsa_ranges.read_cutout(URL, ra, dec, SIZE_DEG))
    assert (x0, y0) == (0, 0) and width < 20 and height < 20
    with pytest.raises(irsa_ranges.PartialReadError):
        irsa_ranges.read_cutout(URL, 151.0, 20.0, SIZE_DEG)


def test_missing_plane_is_reported_as_unreadable(server):
    with pytest.raises(irsa_ranges.PartialReadError):
        irsa_ranges.read_plane(URL, 150.0, 20.0, SIZE_DEG, "WCS-WAVE")


class FakeResponse:
    def __init__(self, status, headers=None, body=b""):
        self.status_code, self.headers, self.body = status, headers or {}, body

    def __enter__(self):
        return self

    def __exit__(self, *details):
        return False

    def iter_content(self, chunk_size=65536):
        yield self.body

    def raise_for_status(self):
        raise requests.HTTPError(f"{self.status_code} Server Error", response=self)


def ask(responses, spec="0-3,10-13"):
    with patch.object(irsa_ranges._session, "get", side_effect=responses) as get, \
            patch("app.integrations.http_retry.time.sleep"):
        return irsa_ranges._request(URL, spec, 1000), get


def test_multipart_response_is_split_by_length_not_by_boundary_text():
    body = (b"--edge\r\nContent-Type: application/fits\r\nContent-Range: bytes 0-3/100\r\n\r\nABCD\r\n"
            b"--edge\r\nContent-Type: application/fits\r\nContent-Range: bytes 10-13/100\r\n\r\n\r\n--\r\n"
            b"--edge--\r\n")
    result, _ = ask([FakeResponse(206, {"Content-Type": "multipart/byteranges; boundary=edge"}, body)])
    assert result == ([(0, b"ABCD"), (10, b"\r\n--")], 100)


def test_single_range_response():
    headers = {"Content-Type": "application/fits", "Content-Range": "bytes 5-8/100"}
    assert ask([FakeResponse(206, headers, b"WXYZ")], "5-8")[0] == ([(5, b"WXYZ")], 100)


@pytest.mark.parametrize("response", [
    FakeResponse(200, {"Content-Type": "application/fits"}, b"x" * 50),
    FakeResponse(206, {"Content-Type": "application/fits", "Content-Range": "bytes 0-1999/5000"}, b"x" * 2000),
    FakeResponse(206, {"Content-Type": "application/fits"}, b"WXYZ"),
])
def test_whole_file_oversized_or_unlabelled_responses_are_refused(response):
    with pytest.raises(irsa_ranges.PartialReadError):
        ask([response], "0-3")


def test_busy_archive_is_retried_then_succeeds():
    good = FakeResponse(206, {"Content-Type": "application/fits", "Content-Range": "bytes 5-8/100"}, b"WXYZ")
    result, get = ask([FakeResponse(503, {"Retry-After": "1"}), good], "5-8")
    assert result == ([(5, b"WXYZ")], 100)
    assert get.call_count == 2


def test_retries_stop_for_permanent_errors_and_timeouts():
    waits = []
    missing = requests.HTTPError(response=FakeResponse(404))
    for error in (missing, requests.Timeout()):
        attempts = iter([error, "never reached"])

        def action():
            outcome = next(attempts)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome
        with pytest.raises(type(error)):
            with_retries(action, sleep=waits.append)
    assert waits == []


def test_persistent_failure_is_raised_after_three_attempts():
    waits, calls = [], []

    def action():
        calls.append(1)
        raise requests.ConnectionError("dropped")
    with pytest.raises(requests.ConnectionError):
        with_retries(action, sleep=waits.append)
    assert len(calls) == 3 and len(waits) == 2


# ---- IrsaClient: partial reads first, the cutout service as the fallback ----

SERVICE = b"SIMPLE  =                    T" + b" " * 100


def service_response():
    response = FakeResponse(200, body=SERVICE)
    response.raise_for_status = lambda: None
    return response


def test_client_prefers_the_partial_read(exposure, server):
    with patch("app.integrations.irsa.requests.get") as service:
        content = IrsaClient().download_cutout(URL, 150.0, 20.0, SIZE_DEG)
    service.assert_not_called()
    assert window_of(content)[2] >= 18


def test_client_falls_back_to_the_cutout_service_when_ranges_are_unsupported():
    unsupported = irsa_ranges.PartialReadError("no ranges")
    with patch.object(irsa_ranges, "read_cutout", side_effect=unsupported), \
            patch("app.integrations.irsa.requests.get", return_value=service_response()) as service:
        assert IrsaClient().download_cutout(URL, 150.0, 20.0, SIZE_DEG) == SERVICE
    assert service.call_args.kwargs["params"]["size"] == str(SIZE_DEG)


@pytest.mark.parametrize("error,expected", [
    (requests.Timeout(), ArchiveTimeout), (requests.ConnectionError(), ArchiveError),
])
def test_client_does_not_fall_back_when_the_archive_is_unreachable(error, expected):
    with patch.object(irsa_ranges, "read_cutout", side_effect=error), \
            patch("app.integrations.irsa.requests.get") as service:
        with pytest.raises(expected):
            IrsaClient().download_cutout(URL, 150.0, 20.0, SIZE_DEG)
    service.assert_not_called()


def test_plane_uses_the_partial_read_only_when_it_matches_the_loaded_grid(exposure, server):
    width, height = window_of(irsa_ranges.read_cutout(URL, 150.0, 20.0, SIZE_DEG))[2:]
    with patch("app.integrations.irsa.requests.get", return_value=service_response()) as service:
        client = IrsaClient()
        matching = client.download_plane(URL, 150.0, 20.0, SIZE_DEG, "ZODI", width, height)
        service.assert_not_called()
        with fits.open(BytesIO(matching)) as hdus:
            assert hdus["ZODI"].data.shape == (height, width)
        # An image loaded through the cutout service may differ by a pixel.
        assert client.download_plane(URL, 150.0, 20.0, SIZE_DEG, "ZODI", width - 1, height) == SERVICE
        service.assert_called_once()
        with pytest.raises(ValueError):
            client.download_plane(URL, 150.0, 20.0, SIZE_DEG, "EPSF", width, height)
