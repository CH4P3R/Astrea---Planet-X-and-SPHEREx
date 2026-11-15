"""Verify the scientific and binary contract without a network dependency."""

from io import BytesIO
import json

from astropy.io import fits
from astropy.wcs import Sip, WCS
import numpy as np
import pytest

from app.services import fits_image
from app.services.fits_image import InvalidFitsError, decode_cutout


def make_fits(data=None, *, wcs=True, sip=False, include_image=True):
    if data is None:
        data = np.arange(12, dtype=np.float32).reshape(3, 4)
    primary = fits.PrimaryHDU()
    primary.header["VERSION"] = "2026.1"
    primary.header["DATE"] = "2026-10-10T12:00:00"
    header = fits.Header()
    if wcs:
        spatial = WCS(naxis=2)
        spatial.wcs.ctype = ["RA---TAN", "DEC--TAN"]
        spatial.wcs.radesys = "ICRS"
        spatial.wcs.crpix = [2.5, 2.0]
        spatial.wcs.crval = [210.80227, 54.34895]
        angle = np.radians(25)
        spatial.wcs.cd = 0.001 * np.array([
            [-np.cos(angle), np.sin(angle)],
            [np.sin(angle), np.cos(angle)],
        ])
        if sip:
            spatial.wcs.ctype = ["RA---TAN-SIP", "DEC--TAN-SIP"]
            a = np.zeros((3, 3))
            b = np.zeros((3, 3))
            a[2, 0] = 1e-5
            b[0, 2] = -2e-5
            spatial.sip = Sip(a, b, None, None, spatial.wcs.crpix)
        header = spatial.to_header(relax=True)
    header["BUNIT"] = "MJy/sr"
    header["OBSID"] = "example-observation"
    header["DETECTOR"] = 2
    header["DATE-OBS"] = "2026-05-01T01:02:03"
    header["TIMESYS"] = "UTC"
    hdus = [primary]
    if include_image:
        hdus.append(fits.ImageHDU(data=data, header=header, name="IMAGE"))
    # These flags are deliberately all nonzero: they must never mask IMAGE.
    hdus.append(fits.ImageHDU(data=np.ones((3, 4), dtype=np.int16), name="FLAGS"))
    stream = BytesIO()
    fits.HDUList(hdus).writeto(stream)
    return stream.getvalue(), header


def test_pixels_keep_order_scale_nonfinite_samples_and_ignore_flags():
    data = np.array([[0.0, -2.5, np.nan], [np.inf, -np.inf, 10.25]], dtype=np.float32)
    payload, _ = make_fits(data)

    decoded = decode_cutout(payload)

    actual = np.frombuffer(decoded.pixels, dtype="<f4").reshape(2, 3)
    np.testing.assert_array_equal(actual, data)
    assert decoded.pixels == data.astype("<f4").tobytes(order="C")
    assert decoded.metadata["width"] == 3
    assert decoded.metadata["height"] == 2
    assert decoded.metadata["dtype"] == "float32"
    assert decoded.metadata["byte_order"] == "little"
    assert decoded.metadata["array_order"] == "C"
    assert decoded.metadata["pixel_origin"] == "lower-left"
    assert decoded.metadata["finite_min"] == -2.5
    assert decoded.metadata["finite_max"] == 10.25
    assert decoded.metadata["nonfinite_count"] == 3
    assert decoded.metadata["unit"] == "MJy/sr"
    json.dumps(decoded.metadata, allow_nan=False)


def test_spatial_wcs_retains_rotation_sip_and_outer_edge_footprint():
    payload, original = make_fits(sip=True)
    decoded = decode_cutout(payload)
    restored = fits.Header()
    for card in decoded.metadata["wcs_header"]:
        restored[card["keyword"]] = (card["value"], card["comment"])

    original_wcs = WCS(original)
    restored_wcs = WCS(restored)
    assert restored_wcs.sip is not None
    np.testing.assert_allclose(
        restored_wcs.all_pix2world([[0, 0], [3, 2]], 0),
        original_wcs.all_pix2world([[0, 0], [3, 2]], 0),
    )
    expected = original_wcs.pixel_to_world(1.5, 1).icrs
    assert decoded.metadata["center"]["ra_deg"] == pytest.approx(expected.ra.deg)
    assert decoded.metadata["center"]["dec_deg"] == pytest.approx(expected.dec.deg)
    assert decoded.metadata["center"]["frame"] == "ICRS"
    np.testing.assert_allclose(
        decoded.metadata["footprint"],
        original_wcs.all_pix2world([[-0.5, -0.5], [3.5, -0.5], [3.5, 2.5], [-0.5, 2.5]], 0),
    )


def test_provenance_keeps_processing_version_and_date_semantics():
    payload, _ = make_fits()
    provenance = decode_cutout(payload).metadata["fits_metadata"]
    assert provenance["observation_id"] == "example-observation"
    assert provenance["detector"] == 2
    assert provenance["processing_version"] == "2026.1"
    assert provenance["header_fields"]["DATE"] == "2026-10-10T12:00:00"
    assert provenance["header_fields"]["DATE-OBS"] == "2026-05-01T01:02:03"
    assert provenance["header_fields"]["TIMESYS"] == "UTC"


def test_float64_pixels_are_not_downcast():
    data = np.array([[1.0000000000000002, 2.3]], dtype=np.float64)
    payload, _ = make_fits(data)
    decoded = decode_cutout(payload)
    assert decoded.metadata["dtype"] == "float64"
    np.testing.assert_array_equal(np.frombuffer(decoded.pixels, dtype="<f8"), data.ravel())


def test_all_nonfinite_data_has_json_safe_statistics():
    payload, _ = make_fits(np.full((2, 2), np.nan, dtype=np.float32))
    metadata = decode_cutout(payload).metadata
    assert metadata["finite_min"] is None
    assert metadata["finite_max"] is None
    assert metadata["nonfinite_count"] == 4
    json.dumps(metadata, allow_nan=False)


@pytest.mark.parametrize("payload", [b"not fits", b""])
def test_corrupt_fits_is_rejected(payload):
    with pytest.raises(InvalidFitsError):
        decode_cutout(payload)


def test_missing_image_is_rejected():
    payload, _ = make_fits(include_image=False)
    with pytest.raises(InvalidFitsError, match="no IMAGE"):
        decode_cutout(payload)


def test_noncelestial_image_is_rejected():
    payload, _ = make_fits(wcs=False)
    with pytest.raises(InvalidFitsError, match="celestial WCS"):
        decode_cutout(payload)


def test_cube_is_rejected():
    payload, _ = make_fits(np.zeros((2, 3, 4), dtype=np.float32))
    with pytest.raises(InvalidFitsError, match="two dimensions"):
        decode_cutout(payload)


def test_oversized_image_is_rejected_before_data_allocation(monkeypatch):
    payload, _ = make_fits()
    monkeypatch.setattr(fits_image, "MAX_IMAGE_PIXELS", 10)
    with pytest.raises(InvalidFitsError, match="pixel count"):
        decode_cutout(payload)
