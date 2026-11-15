"""Extra planes and on-request corrections, with real decoding/cache and a local archive fake."""

from io import BytesIO

from astropy.io import fits
import numpy as np
import pytest

from app.application import create_app
from app.core.config import Settings
from app.integrations.irsa import ArchiveError, ArchiveTimeout
from app.services.fits_image import InvalidFitsError, decode_plane
from app.services.quality import bad_bits, corrected
from test_images_api import FakeArchive, get, search_one


FLAG_CARDS = {
    "MSKN0000": "TRANSIENT", "MSKD0000": "Transient detected during SUR",
    "MSKN0010": "HOT", "MSKD0010": "Hot pixel",
    "MSKN0012": "FULLSAMPLE", "MSKD0012": "Pixel full sample history is available",
    "MSKN0021": "SOURCE", "MSKD0021": "Pixel mapped to a known source",
    "BUNIT": "",  # Real FLAGS headers carry an empty unit.
}
SOURCE_BIT, HOT_BIT, FULLSAMPLE_BIT = 1 << 21, 1 << 10, 1 << 12
NAN = np.nan


class PlaneArchive(FakeArchive):
    """Image values are [[0, -2.5, nan], [4.25, inf, 6]] (see FakeArchive)."""

    def __init__(self):
        super().__init__()
        self.plane_requests = []
        self.plane_error = None
        self.planes = {
            "FLAGS": np.array([[0, 1, 0], [SOURCE_BIT, HOT_BIT, SOURCE_BIT | FULLSAMPLE_BIT]], dtype=np.int32),
            "ZODI": np.full((2, 3), 0.5, dtype=np.float32),
            "VARIANCE": np.array([[4, 4, 4], [0, 4, NAN]], dtype=np.float32),
        }

    def plane_content(self, extension):
        header = fits.Header(FLAG_CARDS) if extension == "FLAGS" else fits.Header({"BUNIT": "MJy/sr"})
        stream = BytesIO()
        fits.HDUList([fits.PrimaryHDU(),
                      fits.ImageHDU(self.planes[extension], header=header, name=extension)]).writeto(stream)
        return stream.getvalue()

    def download_plane(self, **kwargs):
        self.plane_requests.append(kwargs)
        if self.plane_error:
            raise self.plane_error
        return self.plane_content(kwargs["extension"])


@pytest.fixture
def backend(tmp_path):
    archive = PlaneArchive()
    app = create_app(Settings(cutout_cache_dir=tmp_path / "cutouts"))
    app.state.image_service.archive = archive
    return app, archive


def floats(response):
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/octet-stream"
    return np.frombuffer(response.content, dtype="<f4").reshape(2, 3)


def test_plane_metadata_describes_decoding_and_flag_bits(backend):
    app, archive = backend
    item = search_one(app)
    response = get(app, f"/api/v1/images/{item['id']}/planes/flags")
    assert response.status_code == 200, response.text
    plane = response.json()
    assert plane["image_id"] == item["id"]
    assert (plane["plane"], plane["extension"], plane["dtype"]) == ("flags", "FLAGS", "int32")
    assert (plane["width"], plane["height"]) == (3, 2)
    assert (plane["byte_order"], plane["array_order"], plane["pixel_origin"]) == ("little", "C", "lower-left")
    assert plane["pixels_url"] == f"/api/v1/images/{item['id']}/planes/flags/pixels"
    assert plane["unit"] is None
    assert [(bit["bit"], bit["name"]) for bit in plane["flag_bits"]] == [
        (0, "TRANSIENT"), (10, "HOT"), (12, "FULLSAMPLE"), (21, "SOURCE")]
    assert plane["flag_bits"][1]["description"] == "Hot pixel"
    # Only configured names this file defines; SOURCE and FULLSAMPLE are never masked.
    assert plane["masked_flags"] == ["TRANSIENT", "HOT"]
    assert plane["masked_bits"] == 1 | HOT_BIT
    request = archive.plane_requests[0]
    assert (request["extension"], request["width"], request["height"]) == ("FLAGS", 3, 2)
    assert request["size_deg"] == item["requested"]["size_deg"]


def test_plane_pixels_keep_values_and_download_once(backend):
    app, archive = backend
    item = search_one(app)
    base = f"/api/v1/images/{item['id']}/planes"
    flags = get(app, f"{base}/flags/pixels")
    assert flags.status_code == 200
    np.testing.assert_array_equal(np.frombuffer(flags.content, dtype="<i4").reshape(2, 3), archive.planes["FLAGS"])
    np.testing.assert_array_equal(floats(get(app, f"{base}/zodi/pixels")), archive.planes["ZODI"])
    np.testing.assert_array_equal(floats(get(app, f"{base}/variance/pixels")), archive.planes["VARIANCE"])
    zodi = get(app, f"{base}/zodi").json()
    assert (zodi["dtype"], zodi["unit"], zodi["flag_bits"], zodi["masked_bits"]) == ("float32", "MJy/sr", [], 0)
    for _ in range(2):
        assert get(app, f"{base}/zodi/pixels").status_code == 200
    assert [request["extension"] for request in archive.plane_requests] == ["FLAGS", "ZODI", "VARIANCE"]
    # The image itself is downloaded once, before its first plane.
    assert len(archive.downloads) == 1


def test_planes_survive_a_backend_restart(backend, tmp_path):
    app, archive = backend
    item = search_one(app)
    assert get(app, f"/api/v1/images/{item['id']}/planes/zodi").status_code == 200
    restarted = create_app(Settings(cutout_cache_dir=tmp_path / "cutouts"))
    offline = PlaneArchive()
    offline.plane_error = offline.download_error = ArchiveError("must use cached data")
    restarted.state.image_service.archive = offline
    np.testing.assert_array_equal(
        floats(get(restarted, f"/api/v1/images/{item['id']}/planes/zodi/pixels")), archive.planes["ZODI"])


@pytest.mark.parametrize("options,expected,planes", [
    ({"subtract_zodi": "true"}, [[-0.5, -3, NAN], [3.75, np.inf, 5.5]], ["ZODI"]),
    ({"mask_flags": "true"}, [[0, NAN, NAN], [4.25, NAN, 6]], ["FLAGS"]),
    ({"signal_to_noise": "true"}, [[0, -1.25, NAN], [NAN, np.inf, NAN]], ["VARIANCE"]),
    ({"subtract_zodi": "true", "mask_flags": "true", "signal_to_noise": "true"},
     [[-0.25, NAN, NAN], [NAN, NAN, NAN]], ["ZODI", "VARIANCE", "FLAGS"]),
])
def test_corrections_are_applied_on_request(backend, options, expected, planes):
    app, archive = backend
    item = search_one(app)
    np.testing.assert_array_equal(floats(get(app, item["pixels_url"], params=options)),
                                  np.array(expected, dtype=np.float32))
    assert [request["extension"] for request in archive.plane_requests] == planes


def test_plain_pixels_stay_untouched_and_fetch_no_plane(backend):
    app, archive = backend
    item = search_one(app)
    explicit = {"subtract_zodi": "false", "mask_flags": "false", "signal_to_noise": "false"}
    for params in ({}, explicit):
        np.testing.assert_array_equal(floats(get(app, item["pixels_url"], params=params)), archive.values)
    assert archive.plane_requests == []


def test_configured_bad_flags_change_the_mask(tmp_path):
    archive = PlaneArchive()
    app = create_app(Settings(cutout_cache_dir=tmp_path / "cutouts", bad_flags=("HOT", "SOURCE", "UNKNOWN")))
    app.state.image_service.archive = archive
    item = search_one(app)
    plane = get(app, f"/api/v1/images/{item['id']}/planes/flags").json()
    assert (plane["masked_flags"], plane["masked_bits"]) == (["HOT"], HOT_BIT)
    np.testing.assert_array_equal(floats(get(app, item["pixels_url"], params={"mask_flags": "true"})),
                                  np.array([[0, -2.5, NAN], [4.25, NAN, 6]], dtype=np.float32))


@pytest.mark.parametrize("path", ["planes/psf", "planes/psf/pixels", "planes/FLAGS"])
def test_unknown_plane_is_rejected_without_archive_access(backend, path):
    app, archive = backend
    item = search_one(app)
    assert get(app, f"/api/v1/images/{item['id']}/{path}").status_code == 422
    assert archive.downloads == [] and archive.plane_requests == []


def test_invalid_option_and_unknown_image(backend):
    app, _ = backend
    item = search_one(app)
    assert get(app, item["pixels_url"], params={"mask_flags": "maybe"}).status_code == 422
    assert get(app, f"/api/v1/images/{'a' * 64}/planes/zodi").status_code == 404


@pytest.mark.parametrize("error,status", [(ArchiveError, 502), (ArchiveTimeout, 504)])
def test_plane_archive_errors_are_not_cached(backend, error, status):
    app, archive = backend
    item = search_one(app)
    archive.plane_error = error("internal upstream detail")
    for path in (f"/api/v1/images/{item['id']}/planes/zodi", f"{item['pixels_url']}?subtract_zodi=true"):
        response = get(app, path)
        assert response.status_code == status
        assert "internal upstream detail" not in response.text
    archive.plane_error = None
    assert get(app, f"/api/v1/images/{item['id']}/planes/zodi").status_code == 200


def test_plane_on_a_different_grid_is_rejected(backend):
    app, archive = backend
    item = search_one(app)
    archive.planes["ZODI"] = np.zeros((2, 2), dtype=np.float32)
    assert get(app, f"/api/v1/images/{item['id']}/planes/zodi/pixels").status_code == 502


# ---- pure functions ----

def test_decode_plane_reads_any_plane_from_a_full_cutout():
    archive = PlaneArchive()
    stream = BytesIO()
    fits.HDUList([fits.PrimaryHDU()] + [
        fits.ImageHDU(data, header=fits.Header(FLAG_CARDS) if name == "FLAGS" else None, name=name)
        for name, data in archive.planes.items()]).writeto(stream)
    decoded = decode_plane(stream.getvalue(), "flags", 3, 2)
    assert decoded.pixels == archive.planes["FLAGS"].astype("<i4").tobytes()
    assert decoded.metadata["flag_bits"][-1] == {
        "bit": 21, "name": "SOURCE", "description": "Pixel mapped to a known source"}
    assert decode_plane(stream.getvalue(), "variance", 3, 2).metadata["unit"] is None
    for content, plane in ((b"not FITS", "zodi"), (archive.content, "zodi")):
        with pytest.raises(InvalidFitsError):
            decode_plane(content, plane, 3, 2)
    floating = BytesIO()
    fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(np.zeros((2, 3), dtype=np.float32), name="FLAGS")]).writeto(floating)
    with pytest.raises(InvalidFitsError):
        decode_plane(floating.getvalue(), "flags", 3, 2)


def test_bad_bits_use_names_and_never_source():
    bits = [{"bit": 0, "name": "TRANSIENT"}, {"bit": 21, "name": "SOURCE"}, {"bit": 10, "name": "HOT"}]
    assert bad_bits(bits, ("hot", "SOURCE", "MISSING")) == (["HOT"], 1 << 10)
    assert bad_bits([], ("HOT",)) == ([], 0)


def test_corrected_preserves_dtype_and_the_original():
    image = np.array([[1.0, 2.0]], dtype=np.float64)
    result = corrected(image, zodi=np.array([[0.5, 0.5]], dtype=np.float32),
                       variance=np.array([[4.0, -1.0]], dtype=np.float32))
    assert result.dtype == np.float64
    np.testing.assert_array_equal(result, [[0.25, NAN]])
    np.testing.assert_array_equal(image, [[1.0, 2.0]])
    assert corrected(image).tobytes() == image.tobytes()
