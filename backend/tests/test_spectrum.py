"""Aperture photometry must recover a known source, and the endpoint must report it per exposure."""

import asyncio
from io import BytesIO

from astropy.io import fits
from astropy.table import Table
import httpx
import numpy as np
import pytest

from app.application import create_app
from app.core.config import Settings
from app.integrations import irsa_ranges
from app.integrations.irsa import ArchiveError, ArchiveImage, IrsaClient
from app.services import spectrum


URL = "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/week/run/2/image.fits"
SIZE = 60
PIXEL_DEG = 6.15 / 3600
PIXEL_SR = np.deg2rad(PIXEL_DEG) ** 2
RA, DEC = 150.0, 20.0
SOURCE_X, SOURCE_Y = 30.3, 28.6      # Zero-based pixel of (RA, DEC).
TOTAL, BACKGROUND, VARIANCE = 500.0, 0.25, 1e-4
SOURCE_BIT, HOT_BIT, TRANSIENT_BIT = 1 << 21, 1 << 10, 1 << 0


def exposure_bytes(hot=None):
    """A flat background plus a Gaussian star of TOTAL (MJy/sr summed over pixels)."""
    rows, columns = np.indices((SIZE, SIZE))
    sigma = 0.8
    star = TOTAL / (2 * np.pi * sigma ** 2) * np.exp(
        -((columns - SOURCE_X) ** 2 + (rows - SOURCE_Y) ** 2) / (2 * sigma ** 2))
    image = (BACKGROUND + star).astype(np.float32)
    flags = np.zeros((SIZE, SIZE), dtype=np.int32)
    flags[40:, :] = SOURCE_BIT            # A catalogued neighbour over part of the ring's reach.
    if hot:
        flags[hot] |= HOT_BIT
    header = fits.Header()
    header.update({
        "CTYPE1": "RA---TAN", "CTYPE2": "DEC--TAN", "CRVAL1": RA, "CRVAL2": DEC,
        "CRPIX1": SOURCE_X + 1, "CRPIX2": SOURCE_Y + 1, "CDELT1": -PIXEL_DEG, "CDELT2": PIXEL_DEG,
        "CUNIT1": "deg", "CUNIT2": "deg", "BUNIT": "MJy/sr",
        # Spectral lookup WCS, as SPHEREx Level 2 files declare it.
        "WCSAXESW": 2, "CTYPE1W": "WAVE-TAB", "CTYPE2W": "WAVE-TAB", "CUNIT1W": "um", "CUNIT2W": "um",
        "CRPIX1W": 1, "CRPIX2W": 1, "CDELT1W": 1, "CDELT2W": 1, "CRVAL1W": 1, "CRVAL2W": 1,
        "PV1_3W": 1, "PV2_3W": 2, "PS1_0W": "WCS-WAVE", "PS2_0W": "WCS-WAVE",
        "PS1_1W": "VALUES", "PS2_1W": "VALUES", "PS1_2W": "X", "PS2_2W": "Y",
    })
    # Wavelength rises along y from 1.0 to 2.0 um; bandwidth is 0.03 um everywhere.
    values = np.zeros((2, 2, 2), dtype=np.float32)   # [y, x, (wavelength, bandwidth)]
    values[0, :, 0], values[1, :, 0], values[:, :, 1] = 1.0, 2.0, 0.03
    table = Table({"X": [np.array([1, SIZE], dtype=np.int32)], "Y": [np.array([1, SIZE], dtype=np.int32)],
                   "VALUES": [values]})
    names = fits.Header({"MSKN0000": "TRANSIENT", "MSKN0010": "HOT", "MSKN0021": "SOURCE"})
    output = BytesIO()
    fits.HDUList([
        fits.PrimaryHDU(),
        fits.ImageHDU(image, header=header, name="IMAGE"),
        fits.CompImageHDU(flags, header=names, name="FLAGS", compression_type="RICE_1", tile_shape=(1, SIZE)),
        fits.ImageHDU(np.full((SIZE, SIZE), VARIANCE, dtype=np.float32), name="VARIANCE"),
        fits.BinTableHDU(table, name="WCS-WAVE"),
    ]).writeto(output)
    return output.getvalue()


def stamp_of(content, monkeypatch, ra=RA, dec=DEC):
    def serve(reader, url, spec, limit, deadline=None):
        parts = []
        for item in spec.split(","):
            first, last = item.split("-")
            parts.append((int(first), content[int(first):int(last) + 1]))
        return parts, len(content)

    monkeypatch.setattr(irsa_ranges.RangeReader, "_request", serve)
    return IrsaClient().photometry_stamp(URL, ra, dec, spectrum.STAMP_HALF)


def test_aperture_weights_cover_the_circle_area():
    weights = spectrum.aperture_weights((21, 21), 10.3, 9.6, 3.0)
    assert weights.sum() == pytest.approx(np.pi * 9, rel=0.01)
    assert weights.max() == 1 and weights[0, 0] == 0


def test_measure_recovers_flux_background_wavelength_and_error(monkeypatch):
    point = spectrum.measure(stamp_of(exposure_bytes(), monkeypatch), 3.0)

    # A 3-pixel aperture holds 99.9 % of this star.
    assert point["flux_ujy"] == pytest.approx(TOTAL * PIXEL_SR * 1e12, rel=0.01)
    assert point["background_mjy_sr"] == pytest.approx(BACKGROUND, abs=1e-4)
    assert point["wavelength_um"] == pytest.approx(1.0 + SOURCE_Y / (SIZE - 1), rel=1e-5)
    assert point["bandwidth_um"] == pytest.approx(0.03)
    expected = np.sqrt((spectrum.aperture_weights((21, 21), 10.3, 9.6, 3.0) ** 2).sum() * VARIANCE)
    assert point["flux_error_ujy"] == pytest.approx(expected * PIXEL_SR * 1e12, rel=0.01)
    assert point["bad_pixels"] == 0 and point["flags"] == [] and point["crowded"] is False


def test_ignored_pixels_are_dropped_counted_and_reported(monkeypatch):
    clean = spectrum.measure(stamp_of(exposure_bytes(), monkeypatch), 3.0)
    point = spectrum.measure(stamp_of(exposure_bytes(hot=(29, 30)), monkeypatch), 3.0)

    assert point["bad_pixels"] == 1 and point["flags"] == ["HOT"]
    assert point["flux_ujy"] < 0.8 * clean["flux_ujy"]


def test_position_near_the_detector_edge_gives_no_stamp(monkeypatch):
    assert stamp_of(exposure_bytes(), monkeypatch, dec=DEC - 25 * PIXEL_DEG) is None


class FakeArchive:
    def __init__(self, stamp):
        self.stamp, self.reads, self.searches = stamp, [], []
        self.rows = [ArchiveImage(source_url=URL.replace("image", name), observation_id=name, detector=2,
                                  collection="dr1", observed_start_mjd=60000.0 + index, observed_end_mjd=None)
                     for index, name in enumerate(("good", "edge", "broken"))]

    def covering(self, **kwargs):
        self.searches.append(kwargs)
        return self.rows + [ArchiveImage(source_url=URL.replace("image", "other"), observation_id="other",
                                         detector=5, collection="dr1", observed_start_mjd=60005.0,
                                         observed_end_mjd=None)]

    def photometry_stamp(self, source_url, ra_deg, dec_deg, half):
        self.reads.append(source_url)
        if "broken" in source_url:
            raise ArchiveError("down")
        return None if "edge" in source_url else self.stamp


def test_endpoint_returns_one_point_per_measured_exposure_and_caches_it(tmp_path, monkeypatch):
    archive = FakeArchive(stamp_of(exposure_bytes(), monkeypatch))
    app = create_app(Settings(cutout_cache_dir=tmp_path))
    app.state.spectrum_service.archive = archive

    def get():
        async def request():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                return await client.get("/api/v1/spectrum", params={"ra_deg": RA, "dec_deg": DEC, "detector": 2})
        return asyncio.run(request())

    response = get()
    assert response.status_code == 200, response.text
    body = response.json()
    # The detector-5 exposure is found but not measured for detector 2.
    assert body["exposures"] == {"found": 3, "measured": 1, "skipped": 1, "failed": 1}
    assert body["flux_unit"] == "uJy" and body["method"] == "aperture"
    assert body["aperture"] == {"radius_px": 3.0, "annulus_px": [6.0, 9.0]}
    point = body["points"][0]
    assert point["observation_id"] == "good" and point["detector"] == 2
    assert point["observed_utc"] == "2023-02-25T00:00:00.000Z"

    async def without_detector():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            return await client.get("/api/v1/spectrum", params={"ra_deg": RA, "dec_deg": DEC})
    assert asyncio.run(without_detector()).status_code == 422

    get()
    # Only the failed exposure is read again, and the archive is searched once for all detectors.
    assert [url.rsplit("/", 1)[1] for url in archive.reads[3:]] == ["broken.fits"]
    assert archive.searches == [{"ra_deg": RA, "dec_deg": DEC}]
