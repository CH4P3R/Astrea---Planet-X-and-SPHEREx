"""Exercise the HTTP contract with real decoding/cache and a local archive fake."""

import asyncio
from dataclasses import replace
from io import BytesIO

from astropy.io import fits
from astropy.wcs import WCS
import httpx
import numpy as np
import pytest

from app.application import create_app
from app.core.config import Settings
from app.integrations.irsa import ArchiveError, ArchiveImage, ArchiveTimeout


QUERY = {"ra_deg": 210.80227, "dec_deg": 54.34895, "size_deg": 0.1}
SOURCE = "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/x.fits"


class FakeArchive:
    def __init__(self):
        self.searches = []
        self.downloads = []
        self.search_error = None
        self.download_error = None
        self.rows = [ArchiveImage(
            source_url=SOURCE, observation_id="observation-1", detector=2,
            collection="dr1", observed_start_mjd=60000.0,
            observed_end_mjd=60000.001,
        )]
        self.values = np.array([[0, -2.5, np.nan], [4.25, np.inf, 6]], dtype=np.float32)
        spatial = WCS(naxis=2)
        spatial.wcs.ctype = ["RA---TAN", "DEC--TAN"]
        spatial.wcs.radesys = "ICRS"
        spatial.wcs.crpix = [2, 1.5]
        spatial.wcs.crval = [QUERY["ra_deg"], QUERY["dec_deg"]]
        spatial.wcs.cdelt = [-0.001, 0.001]
        header = spatial.to_header()
        header["BUNIT"] = "MJy/sr"
        header["OBSID"] = "observation-1"
        header["DETECTOR"] = 2
        stream = BytesIO()
        fits.HDUList([
            fits.PrimaryHDU(),
            fits.ImageHDU(self.values, header=header, name="IMAGE"),
        ]).writeto(stream)
        self.content = stream.getvalue()

    def search(self, **kwargs):
        self.searches.append(kwargs)
        if self.search_error:
            raise self.search_error
        return self.rows

    def download_cutout(self, **kwargs):
        self.downloads.append(kwargs)
        if self.download_error:
            raise self.download_error
        return self.content


@pytest.fixture
def backend(tmp_path):
    archive = FakeArchive()
    app = create_app(Settings(cutout_cache_dir=tmp_path / "cutouts"))
    app.state.image_service.archive = archive
    return app, archive


def get(app, path, **kwargs):
    async def request():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            return await client.get(path, **kwargs)

    return asyncio.run(request())


def search_one(app, **overrides):
    response = get(app, "/api/v1/images", params={**QUERY, **overrides})
    assert response.status_code == 200, response.text
    return response.json()["images"][0]


def test_search_only_returns_discovery_and_exact_cutout_selection(backend):
    app, archive = backend
    response = get(app, "/api/v1/images", params={**QUERY, "detector": 2})

    assert response.status_code == 200
    body = response.json()
    assert body["has_more"] is False
    assert body["order"] == "observation_start_desc"
    item = body["images"][0]
    assert item["source_url"] == SOURCE
    assert item["requested"] == {**QUERY, "frame": "ICRS"}
    assert item["detector"] == 2
    assert item["observation"]["start_utc"] == "2023-02-25T00:00:00.000Z"
    assert item["metadata_url"] == f"/api/v1/images/{item['id']}"
    assert item["pixels_url"] == f"/api/v1/images/{item['id']}/pixels"
    assert "image" not in item
    assert archive.downloads == []
    assert archive.searches[0]["detector"] == 2


def test_selected_cutout_metadata_and_binary_preserve_values_and_download_once(backend):
    app, archive = backend
    item = search_one(app)
    response = get(app, item["metadata_url"])

    assert response.status_code == 200
    metadata = response.json()["image"]
    assert (metadata["height"], metadata["width"]) == archive.values.shape
    assert metadata["dtype"] == "float32"
    assert metadata["byte_order"] == "little"
    assert metadata["array_order"] == "C"
    assert metadata["pixel_origin"] == "lower-left"
    assert metadata["unit"] == "MJy/sr"
    assert metadata["nonfinite_count"] == 2
    assert metadata["finite_min"] == -2.5
    assert metadata["finite_max"] == 6.0
    assert metadata["center"]["ra_deg"] == pytest.approx(QUERY["ra_deg"])
    assert metadata["center"]["dec_deg"] == pytest.approx(QUERY["dec_deg"])
    assert len(metadata["footprint"]) == 4
    assert any(card["keyword"] == "CTYPE1" for card in metadata["wcs_header"])

    pixels = get(app, item["pixels_url"])
    assert pixels.status_code == 200
    assert pixels.headers["content-type"] == "application/octet-stream"
    assert len(pixels.content) == 2 * 3 * 4
    actual = np.frombuffer(pixels.content, dtype="<f4").reshape(2, 3)
    np.testing.assert_array_equal(actual, archive.values)
    assert get(app, item["metadata_url"]).json() == response.json()
    assert archive.downloads == [{"source_url": SOURCE, **QUERY}]


def test_pixels_can_be_requested_first_and_survive_backend_restart(backend):
    app, archive = backend
    item = search_one(app)
    first = get(app, item["pixels_url"])
    assert first.status_code == 200

    restarted = create_app(Settings(cutout_cache_dir=app.state.image_service.store.root))
    unavailable = FakeArchive()
    unavailable.download_error = ArchiveError("must use cached data")
    restarted.state.image_service.archive = unavailable

    assert get(restarted, item["pixels_url"]).content == first.content
    assert get(restarted, item["metadata_url"]).status_code == 200
    assert unavailable.downloads == []


def test_ids_distinguish_cutout_geometry_and_remain_stable(backend):
    app, _ = backend
    original = search_one(app)["id"]
    assert search_one(app)["id"] == original
    assert search_one(app, ra_deg=210.9)["id"] != original
    assert search_one(app, dec_deg=54.4)["id"] != original
    assert search_one(app, size_deg=0.2)["id"] != original


def test_limit_exposes_truncation_without_downloading(backend):
    app, archive = backend
    archive.rows.append(replace(archive.rows[0], source_url=SOURCE.replace("x.fits", "y.fits")))
    response = get(app, "/api/v1/images", params={**QUERY, "limit": 1})
    assert response.status_code == 200
    assert len(response.json()["images"]) == 1
    assert response.json()["has_more"] is True
    assert archive.searches[0]["limit"] == 1
    assert archive.downloads == []


def test_empty_search_is_a_successful_empty_list(backend):
    app, archive = backend
    archive.rows = []
    response = get(app, "/api/v1/images", params=QUERY)
    assert response.status_code == 200
    assert response.json()["images"] == []
    assert response.json()["has_more"] is False


def test_date_filters_are_converted_using_the_supplied_timezone(backend):
    app, archive = backend
    response = get(app, "/api/v1/images", params={
        **QUERY, "start_time": "2023-02-24T18:00:00-06:00",
        "end_time": "2023-02-26T00:00:00Z",
    })
    assert response.status_code == 200
    assert archive.searches[0]["start_mjd"] == pytest.approx(60000)
    assert archive.searches[0]["end_mjd"] == pytest.approx(60001)


@pytest.mark.parametrize("invalid", [
    {"ra_deg": -1}, {"ra_deg": 360}, {"ra_deg": "nan"},
    {"dec_deg": -91}, {"dec_deg": "inf"}, {"size_deg": 0},
    {"size_deg": 0.51}, {"size_deg": "nan"}, {"detector": 0},
    {"detector": 7}, {"limit": 0}, {"limit": 101},
    {"start_time": "2023-02-25T00:00:00"},
    {"start_time": "not-a-date"},
    {"start_time": "2023-02-26T00:00:00Z", "end_time": "2023-02-25T00:00:00Z"},
    {"unknown_parameter": "ignored?"},
])
def test_invalid_queries_are_rejected_before_accessing_archive(backend, invalid):
    app, archive = backend
    response = get(app, "/api/v1/images", params={**QUERY, **invalid})
    assert response.status_code == 422
    assert archive.searches == []
    assert archive.downloads == []


@pytest.mark.parametrize("suffix", ["", "/pixels"])
def test_unknown_well_formed_id_returns_404(backend, suffix):
    app, archive = backend
    response = get(app, f"/api/v1/images/{'a' * 64}{suffix}")
    assert response.status_code == 404
    assert archive.downloads == []


@pytest.mark.parametrize("error,status", [(ArchiveError, 502), (ArchiveTimeout, 504)])
@pytest.mark.parametrize("operation", ["search", "download"])
def test_archive_errors_have_consistent_http_status(backend, error, status, operation):
    app, archive = backend
    if operation == "search":
        archive.search_error = error("internal upstream detail")
        response = get(app, "/api/v1/images", params=QUERY)
    else:
        item = search_one(app)
        archive.download_error = error("internal upstream detail")
        response = get(app, item["metadata_url"])
    assert response.status_code == status
    assert "internal upstream detail" not in response.text


def test_invalid_fits_returns_502_and_is_not_cached(backend):
    app, archive = backend
    item = search_one(app)
    valid_content = archive.content
    archive.content = b"not a FITS image"
    assert get(app, item["pixels_url"]).status_code == 502
    archive.content = valid_content
    assert get(app, item["pixels_url"]).status_code == 200
    assert len(archive.downloads) == 2


def test_openapi_describes_routes_and_binary_response(backend):
    app, _ = backend
    response = get(app, "/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    assert set(paths) == {
        "/api/v1/images", "/api/v1/images/{image_id}",
        "/api/v1/images/{image_id}/pixels",
        "/api/v1/images/search", "/api/v1/images/load/{image_id}",
        "/api/v1/images/{image_id}/projection",
        "/api/v1/stars", "/api/v1/star-catalog", "/api/v1/sky",
    }
    content = paths["/api/v1/images/{image_id}/pixels"]["get"]["responses"]["200"]["content"]
    assert content["application/octet-stream"]["schema"]["format"] == "binary"


def post(app, path, **kwargs):
    async def request():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            return await client.post(path, **kwargs)
    return asyncio.run(request())


def test_click_load_pixels_and_projection_flow(backend):
    from astropy.utils import iers
    from app.services.sky import calculate_sky
    from datetime import datetime, timezone
    app, archive = backend
    observer = {"latitude_deg": 14, "longitude_deg": -89, "elevation_m": 0}
    at = datetime(2025, 1, 1, tzinfo=timezone.utc)
    star = {"hipparcos_id": 1, "common_name": "test", "right_ascension_deg": QUERY["ra_deg"],
            "declination_deg": QUERY["dec_deg"], "apparent_magnitude": 1, "color_hex": "#ffffff",
            "pm_ra_cosdec_arcsec_yr": 0, "pm_dec_arcsec_yr": 0}
    with iers.conf.set_temp("auto_download", False):
        direction = calculate_sky([star], observer, at, False)["directions"][0]
        request = {"observer": observer, "at": at.isoformat(), "mode": "paused"}
        search = post(app, "/api/v1/images/search", json={**request, "direction": direction, "size_arcmin": 6})
        assert search.status_code == 200, search.text
        assert archive.searches[0]["ra_deg"] == pytest.approx(QUERY["ra_deg"], abs=1e-6)
        assert archive.downloads == []
        item = search.json()["images"][0]
        metadata = post(app, f"/api/v1/images/load/{item['id']}")
        assert metadata.status_code == 200, metadata.text
        assert get(app, item["pixels_url"]).status_code == 200
        projection = post(app, f"/api/v1/images/{item['id']}/projection", json=request)
        assert projection.status_code == 200, projection.text
        geometry = projection.json()
        assert len(geometry["directions"][0]) // 3 == len(geometry["uv"]) // 2
        assert geometry["mesh_error_pixels"] <= 0.15
        assert len(archive.downloads) == 1


def test_star_routes_version_and_sky(backend):
    from astropy.utils import iers
    from unittest.mock import Mock
    from test_sky import STAR, OBSERVER
    app, _ = backend
    service = Mock()
    service.selected.return_value = [STAR]
    service.metadata.return_value = {"catalog_version": "test-version", "stars": [STAR]}
    app.state.star_service = service
    assert get(app, "/api/v1/stars?magnitude_limit=3").json() == [STAR]
    service.selected.assert_called_with(3)
    assert get(app, "/api/v1/star-catalog").json()["catalog_version"] == "test-version"
    request = {"observer": OBSERVER, "at": "2025-01-01T00:00:00Z", "mode": "paused"}
    assert post(app, "/api/v1/sky", json={**request, "catalog_version": "old"}).status_code == 409
    with iers.conf.set_temp("auto_download", False):
        response = post(app, "/api/v1/sky", json=request)
    assert response.status_code == 200, response.text
    assert response.json()["star_count"] == 1
    assert len(response.json()["sample_times_ms"]) == 1
