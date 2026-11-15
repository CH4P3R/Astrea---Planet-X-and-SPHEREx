"""The tutorial uses actual bundled FITS and never calls the archive"""

from pathlib import Path

import numpy as np
import pytest

from app.integrations.cutout_store import CacheError, CutoutStore
from app.schemas.images import ImageSearchQuery
from app.services.fits_image import InvalidFitsError
from app.services.images import ImageService
from app.services.onboarding import OnboardingCatalog


QUERY = {"ra_deg": 269.4463, "dec_deg": 4.7679, "size_deg": 7 / 60}


class NoArchive:
    def __getattr__(self, name):
        raise AssertionError(f"The tutorial must not contact IRSA: {name}")


@pytest.fixture
def service(tmp_path):
    return ImageService(archive=NoArchive(), store=CutoutStore(tmp_path), api_prefix="/api/v1")


def test_local_catalog_has_two_real_observations_newest_first(service):
    result = service.onboarding(ImageSearchQuery(**QUERY))
    assert len(result.images) == 2
    assert not result.has_more
    assert result.images[0].observation.start_mjd > result.images[1].observation.start_mjd
    assert {image.detector for image in result.images} == {3}
    assert {image.collection for image in result.images} == {"dr1"}
    for image in result.images:
        metadata = service.metadata(image.id)
        assert metadata.image.width == metadata.image.height == 68
        assert metadata.image.fits_metadata["observation_id"] == image.observation_id
        raw = np.fromfile(service.pixels(image.id), dtype="<f4")
        assert raw.size == 68 * 68
        assert np.isfinite(raw).any()


def test_real_local_planes_support_all_processing_options(service):
    image = service.onboarding(ImageSearchQuery(**QUERY)).images[0]
    for plane in ("flags", "zodi", "variance"):
        metadata = service.plane(image.id, plane)
        assert metadata.width == metadata.height == 68
        assert service.plane_pixels(image.id, plane).stat().st_size == 68 * 68 * 4
    corrected = service.corrected_pixels(image.id, subtract_zodi=True, mask_flags=True, signal_to_noise=True)
    assert len(corrected) == 68 * 68 * 4


@pytest.mark.parametrize("overrides", [
    {"detector": 1}, {"ra_deg": 0}, {"size_deg": 0.1},
    {"start_time": "2026-01-01T00:00:00Z", "end_time": "2026-12-31T23:59:59Z"},
])
def test_local_search_does_not_invent_missing_observations(service, overrides):
    result = service.onboarding(ImageSearchQuery(**{**QUERY, **overrides}))
    assert result.images == []
    assert not result.has_more


def test_local_limit_and_no_remote_recrop(service):
    result = service.onboarding(ImageSearchQuery(**QUERY, limit=1))
    assert len(result.images) == 1
    assert result.has_more
    with pytest.raises(InvalidFitsError, match="fixed local cutout"):
        service.recrop(result.images[0].id, 0.01)


def test_changed_local_fits_is_rejected(tmp_path):
    import json

    catalog = OnboardingCatalog()
    entry = catalog.entries()[0]
    (tmp_path / "manifest.json").write_text(json.dumps({"observations": [entry]}), encoding="utf-8")
    (tmp_path / entry["file"]).write_bytes(b"not a FITS")
    with pytest.raises(CacheError, match="checksum"):
        OnboardingCatalog(Path(tmp_path)).content(entry["id"])
