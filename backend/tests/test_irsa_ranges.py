"""Byte-range reads must reproduce the exposure's pixels without reading all of it."""

from io import BytesIO
from unittest.mock import MagicMock, patch

from astropy.io import fits
from astropy.table import Table
from astropy.wcs import WCS
import numpy as np
import pytest
import requests

from app.integrations import irsa_ranges
from app.integrations.http_retry import timeout_until, with_retries
from app.integrations.irsa import ArchiveError, ArchiveTimeout, IrsaClient, align_plane


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
    """Stands in for RangeReader._request and records the bytes it served."""

    def __init__(self, content):
        self.content, self.requests = content, []

    def __call__(self, url, spec, limit, deadline=None):
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
    monkeypatch.setattr(irsa_ranges.RangeReader, "_request",
                        lambda reader, url, spec, limit, deadline=None: server(url, spec, limit, deadline))
    # A small guess forces the header walk to be exercised.
    monkeypatch.setattr(irsa_ranges, "HEADER_GUESS", 2 * irsa_ranges.BLOCK)
    return server


@pytest.fixture
def reader(server):
    return irsa_ranges.RangeReader()


def grid_of(content):
    """The (crpix1, crpix2, width, height) grid of a cutout, as ImageService passes it."""
    with fits.open(BytesIO(content)) as hdus:
        header = hdus["IMAGE"].header
        return float(header["CRPIX1"]), float(header["CRPIX2"]), header["NAXIS1"], header["NAXIS2"]


def window_of(content):
    """Origin of a cutout inside the exposure, from its shifted reference pixel."""
    with fits.open(BytesIO(content)) as hdus:
        header = hdus["IMAGE"].header
        return round(25.5 - header["CRPIX1"]), round(20.5 - header["CRPIX2"]), header["NAXIS1"], header["NAXIS2"]


def test_cutout_holds_only_the_image_window(exposure, server, reader):
    content, image, _ = exposure
    cutout = reader.read_cutout(URL, 150.0, 20.0, SIZE_DEG)
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


def test_planes_share_the_cutout_window(exposure, reader):
    _, image, flags = exposure
    cutout = reader.read_cutout(URL, 150.0, 20.0, SIZE_DEG)
    x0, y0, width, height = window_of(cutout)
    rows, columns = slice(y0, y0 + height), slice(x0, x0 + width)
    expected = {"FLAGS": flags, "ZODI": image * 0.5, "VARIANCE": np.abs(image) + 1}
    for extension, full in expected.items():
        content = reader.read_plane(URL, extension, grid_of(cutout))
        with fits.open(BytesIO(content)) as hdus:
            np.testing.assert_array_equal(hdus[extension].data, full[rows, columns])
            if extension == "FLAGS":
                # Bit names travel with the plane so it can be interpreted.
                assert hdus[extension].header["MSKN0021"] == "SOURCE"


def test_layout_is_remembered_between_reads(server, reader):
    reader.read_cutout(URL, 150.0, 20.0, SIZE_DEG)
    first = len(server.requests)
    reader.read_cutout(URL, 150.0, 20.0, SIZE_DEG)
    assert sum(server.requests[first:]) < sum(server.requests[:first]) / 2


def test_window_is_clipped_at_the_edge_and_rejected_outside(exposure, server, reader):
    content, image, _ = exposure
    with fits.open(BytesIO(content)) as source:
        ra, dec = (float(value) for value in WCS(source["IMAGE"].header).pixel_to_world_values(1, 1))
    x0, y0, width, height = window_of(reader.read_cutout(URL, ra, dec, SIZE_DEG))
    assert (x0, y0) == (0, 0) and width < 20 and height < 20
    with pytest.raises(irsa_ranges.PartialReadError):
        reader.read_cutout(URL, 151.0, 20.0, SIZE_DEG)


def test_missing_plane_is_reported_as_unreadable(reader):
    grid = grid_of(reader.read_cutout(URL, 150.0, 20.0, SIZE_DEG))
    with pytest.raises(irsa_ranges.PartialReadError):
        reader.read_plane(URL, "WCS-WAVE", grid)


def test_plane_follows_the_given_grid_not_the_requested_size(exposure, reader):
    """A grid shifted by one pixel (an image from the cutout service) is read exactly."""
    _, image, _ = exposure
    crpix1, crpix2, width, height = grid_of(reader.read_cutout(URL, 150.0, 20.0, SIZE_DEG))
    x0, y0 = round(25.5 - (crpix1 - 1)), round(20.5 - crpix2)
    with fits.open(BytesIO(reader.read_plane(URL, "ZODI", (crpix1 - 1, crpix2, width, height)))) as hdus:
        np.testing.assert_array_equal(hdus["ZODI"].data, image[y0:y0 + height, x0:x0 + width] * 0.5)


@pytest.mark.parametrize("grid", [(10.25, 10.5, 5, 5), (-22.5, 20.5, 5, 5), (30.5, 20.5, 5, 5)])
def test_plane_grids_that_do_not_fit_the_exposure_are_unreadable(reader, grid):
    """Fractional offsets and windows outside the detector cannot be read by ranges."""
    with pytest.raises(irsa_ranges.PartialReadError):
        reader.read_plane(URL, "ZODI", grid)


def test_readers_do_not_share_layouts(server):
    first, second = irsa_ranges.RangeReader(), irsa_ranges.RangeReader()
    first.read_cutout(URL, 150.0, 20.0, SIZE_DEG)
    assert URL in first._layouts and URL not in second._layouts


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


def ask(responses, spec="0-3,10-13", deadline=None):
    session = MagicMock()
    session.get.side_effect = responses
    with patch("app.integrations.http_retry.time.sleep"):
        return irsa_ranges.RangeReader(session)._request(URL, spec, 1000, deadline), session.get


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
    with patch.object(irsa_ranges.RangeReader, "read_cutout", side_effect=unsupported), \
            patch("app.integrations.irsa.requests.get", return_value=service_response()) as service:
        assert IrsaClient().download_cutout(URL, 150.0, 20.0, SIZE_DEG) == SERVICE
    assert service.call_args.kwargs["params"]["size"] == str(SIZE_DEG)


@pytest.mark.parametrize("error,expected", [
    (requests.Timeout(), ArchiveTimeout), (requests.ConnectionError(), ArchiveError),
])
def test_client_does_not_fall_back_when_the_archive_is_unreachable(error, expected):
    with patch.object(irsa_ranges.RangeReader, "read_cutout", side_effect=error), \
            patch("app.integrations.irsa.requests.get") as service:
        with pytest.raises(expected):
            IrsaClient().download_cutout(URL, 150.0, 20.0, SIZE_DEG)
    service.assert_not_called()


def test_plane_is_read_by_ranges_over_the_loaded_grid(exposure, server):
    reader = irsa_ranges.RangeReader()
    grid = grid_of(reader.read_cutout(URL, 150.0, 20.0, SIZE_DEG))
    with patch("app.integrations.irsa.requests.get") as service:
        client = IrsaClient(ranges=reader)
        content = client.download_plane(URL, 150.0, 20.0, SIZE_DEG, "ZODI", grid)
        service.assert_not_called()
        with fits.open(BytesIO(content)) as hdus:
            assert hdus["ZODI"].data.shape == (grid[3], grid[2])
        with pytest.raises(ValueError):
            client.download_plane(URL, 150.0, 20.0, SIZE_DEG, "EPSF", grid)


def service_cutout(image_crpix, planes):
    """A cutout-service response: IMAGE plus planes, all on the service's own grid."""
    header = fits.Header({"CRPIX1": image_crpix[0], "CRPIX2": image_crpix[1]})
    names = fits.Header({"MSKN0009": "MISSING_DATA", "MSKN0021": "SOURCE"})
    hdus = [fits.PrimaryHDU(), fits.ImageHDU(planes["ZODI"], header=header, name="IMAGE")]
    hdus += [fits.ImageHDU(data, header=names if name == "FLAGS" else None, name=name) for name, data in planes.items()]
    stream = BytesIO()
    fits.HDUList(hdus).writeto(stream)
    return stream.getvalue()


def test_fallback_plane_one_pixel_smaller_is_padded_onto_the_image_grid():
    zodi = np.arange(12, dtype=np.float32).reshape(3, 4)
    flags = np.arange(12, dtype=np.int32).reshape(3, 4)
    # The service window starts one column later than the image: CRPIX is one smaller.
    content = service_cutout((9.0, 5.0), {"ZODI": zodi, "FLAGS": flags})
    grid = (10.0, 5.0, 5, 3)
    with fits.open(BytesIO(align_plane(content, "ZODI", grid))) as hdus:
        aligned = hdus["ZODI"].data
    assert aligned.shape == (3, 5)
    assert np.isnan(aligned[:, 0]).all()
    np.testing.assert_array_equal(aligned[:, 1:], zodi)
    with fits.open(BytesIO(align_plane(content, "FLAGS", grid))) as hdus:
        aligned = hdus["FLAGS"].data
        assert hdus["FLAGS"].header["MSKN0021"] == "SOURCE"
    assert (aligned[:, 0] == 1 << 9).all()
    np.testing.assert_array_equal(aligned[:, 1:], flags)


def test_fallback_plane_one_pixel_larger_is_cropped_onto_the_image_grid():
    zodi = np.arange(20, dtype=np.float32).reshape(4, 5)
    content = service_cutout((10.0, 6.0), {"ZODI": zodi})
    with fits.open(BytesIO(align_plane(content, "ZODI", (9.0, 5.0, 4, 3)))) as hdus:
        np.testing.assert_array_equal(hdus["ZODI"].data, zodi[1:, 1:])


def test_fallback_plane_with_a_fractional_offset_is_an_archive_error():
    content = service_cutout((9.5, 5.0), {"ZODI": np.zeros((3, 4), dtype=np.float32)})
    with pytest.raises(ArchiveError):
        align_plane(content, "ZODI", (10.0, 5.0, 4, 3))


def test_client_aligns_the_service_plane_when_ranges_are_unsupported():
    zodi = np.arange(12, dtype=np.float32).reshape(3, 4)
    response = FakeResponse(200, body=service_cutout((9.0, 5.0), {"ZODI": zodi}))
    response.raise_for_status = lambda: None
    with patch.object(irsa_ranges.RangeReader, "read_plane", side_effect=irsa_ranges.PartialReadError("no")), \
            patch("app.integrations.irsa.requests.get", return_value=response):
        content = IrsaClient().download_plane(URL, 150.0, 20.0, SIZE_DEG, "ZODI", (10.0, 5.0, 5, 3))
    with fits.open(BytesIO(content)) as hdus:
        assert hdus["ZODI"].data.shape == (3, 5)


# ---- Download budget ----

def test_an_exhausted_budget_is_a_timeout_before_any_request():
    with pytest.raises(requests.Timeout):
        timeout_until(0.0)
    session = MagicMock()
    with pytest.raises(requests.Timeout):
        irsa_ranges.RangeReader(session)._request(URL, "0-3", 1000, deadline=0.0)
    session.get.assert_not_called()


def test_timeouts_shrink_to_the_remaining_budget():
    with patch("app.integrations.http_retry.time.monotonic", return_value=100.0):
        assert timeout_until(None) == (10.0, 40.0)
        assert timeout_until(103.0) == (3.0, 3.0)


def test_no_retry_wait_runs_past_the_deadline():
    waits, calls = [], []

    def action():
        calls.append(1)
        raise requests.ConnectionError("dropped")
    with patch("app.integrations.http_retry.time.monotonic", return_value=100.0):
        with pytest.raises(requests.ConnectionError):
            with_retries(action, sleep=waits.append, deadline=101.5)
    assert len(calls) == 2 and waits == [1.0]


def test_client_budget_maps_to_archive_timeout():
    with patch("app.integrations.irsa.requests.get") as service:
        with pytest.raises(ArchiveTimeout):
            IrsaClient(budget_seconds=0).download_cutout(URL, 150.0, 20.0, SIZE_DEG)
    service.assert_not_called()


# ---- Timing logs ----

def test_each_download_logs_one_timing_line(exposure, server, caplog):
    reader = irsa_ranges.RangeReader()
    with caplog.at_level("INFO", logger="app.integrations.irsa"):
        cutout = IrsaClient(ranges=reader).download_cutout(URL, 150.0, 20.0, SIZE_DEG, label="abc123")
        IrsaClient(ranges=reader).download_plane(URL, 150.0, 20.0, SIZE_DEG, "ZODI", grid_of(cutout), label="abc123")
    lines = [record.getMessage() for record in caplog.records if record.getMessage().startswith("IRSA ")]
    assert len(lines) == 2
    assert lines[0].startswith("IRSA cutout image=abc123 path=ranges outcome=ok bytes=")
    assert lines[1].startswith("IRSA plane ZODI image=abc123 path=ranges outcome=ok bytes=")
    assert all("retries=0" in line for line in lines)


def test_fallback_and_retries_appear_in_the_timing_line(caplog):
    busy = FakeResponse(503, {"Retry-After": "1"})
    busy.raise_for_status = lambda: (_ for _ in ()).throw(requests.HTTPError(response=busy))
    with patch.object(irsa_ranges.RangeReader, "read_cutout", side_effect=irsa_ranges.PartialReadError("no")), \
            patch("app.integrations.irsa.requests.get", side_effect=[busy, service_response()]), \
            patch("app.integrations.http_retry.time.sleep"), \
            caplog.at_level("INFO", logger="app.integrations.irsa"):
        IrsaClient().download_cutout(URL, 150.0, 20.0, SIZE_DEG)
    messages = [record.getMessage() for record in caplog.records]
    assert any("using the IRSA cutout service" in message for message in messages)
    line = next(message for message in messages if message.startswith("IRSA cutout"))
    assert "image=- path=service outcome=ok" in line and "retries=1" in line


def test_failed_download_is_logged_as_an_error(caplog):
    with patch.object(irsa_ranges.RangeReader, "read_cutout", side_effect=requests.Timeout()), \
            caplog.at_level("INFO", logger="app.integrations.irsa"):
        with pytest.raises(ArchiveTimeout):
            IrsaClient().download_cutout(URL, 150.0, 20.0, SIZE_DEG, label="x")
    line = next(record.getMessage() for record in caplog.records if record.getMessage().startswith("IRSA cutout"))
    assert "image=x path=ranges outcome=error bytes=0" in line
