"""Box selection: dragged corners → ICRS centre and covering cutout size."""

from datetime import datetime, timezone

import astropy.units as u
from astropy.coordinates import SkyCoord
from astropy.utils import iers
import numpy as np
import pytest

from app.services.image_geometry import (
    MIN_SELECTION_DEG, SelectionTooLarge, SelectionTooSmall, box_selection, click_to_icrs, directions_to_icrs,
)
from app.services.sky import calculate_sky

OBSERVER = {"latitude_deg": 14., "longitude_deg": -89., "elevation_m": 0}
AT = datetime(2025, 1, 1, tzinfo=timezone.utc)


def square(ra, dec, side_deg, rotation_deg=0.0):
    """Corners of a square of `side_deg`, centred on (ra, dec), rotated from north, in drag order."""
    center = SkyCoord(ra=ra * u.deg, dec=dec * u.deg)
    half = side_deg / 2
    corners = []
    for dx, dy in ((-half, half), (half, half), (half, -half), (-half, -half)):
        angle = np.radians(rotation_deg)
        x, y = dx * np.cos(angle) - dy * np.sin(angle), dx * np.sin(angle) + dy * np.cos(angle)
        corners.append(center.spherical_offsets_by(x * u.deg, y * u.deg))
    return SkyCoord(corners)


def scene_directions(corners):
    """The directions the frontend would send for these corners, from the sky calculation."""
    stars = [{"hipparcos_id": i, "common_name": "corner", "right_ascension_deg": float(c.ra.deg),
              "declination_deg": float(c.dec.deg), "apparent_magnitude": 1., "color_hex": "#fff",
              "pm_ra_cosdec_arcsec_yr": 0., "pm_dec_arcsec_yr": 0.} for i, c in enumerate(corners, 1)]
    flat = calculate_sky(stars, OBSERVER, AT, False)["directions"][0]
    return [flat[i:i + 3] for i in range(0, len(flat), 3)]


@pytest.mark.parametrize("ra,dec", [(90.0, 20.0), (359.99, 5.0), (0.01, -30.0), (200.0, 89.9)])
def test_round_trip_recovers_centre_and_size(ra, dec):
    corners = square(ra, dec, 0.2)
    with iers.conf.set_temp("auto_download", False):
        recovered = directions_to_icrs(scene_directions(corners), OBSERVER, AT)
    box = box_selection(recovered)
    centre = SkyCoord(ra=box.ra_deg * u.deg, dec=box.dec_deg * u.deg)
    assert centre.separation(SkyCoord(ra=ra * u.deg, dec=dec * u.deg)).arcsec < 1
    assert box.size_deg == pytest.approx(0.2, rel=0.01)
    assert 0 <= box.ra_deg < 360
    assert len(box.corners) == 4


def test_rotated_box_gets_the_covering_square():
    assert box_selection(square(150.0, 10.0, 0.2, rotation_deg=45)).size_deg == pytest.approx(0.2 * np.sqrt(2), rel=0.01)


def test_box_across_ra_zero_is_centred_on_it():
    box = box_selection(square(0.0, 0.0, 0.1))
    assert min(box.ra_deg, 360 - box.ra_deg) < 1e-6
    assert box.size_deg == pytest.approx(0.1, rel=0.01)


def test_limits():
    with pytest.raises(SelectionTooLarge, match="spans 36.0′; the maximum is 30′"):
        box_selection(square(150.0, 10.0, 0.6))
    with pytest.raises(SelectionTooSmall):
        box_selection(square(150.0, 10.0, MIN_SELECTION_DEG / 2))


@pytest.mark.parametrize("direction", [[0, 0, 0], [np.nan, 1, 0], [np.inf, 0, 0]])
def test_invalid_directions_are_rejected(direction):
    with pytest.raises(ValueError):
        directions_to_icrs([[0, 1, 0], direction], OBSERVER, AT)


def test_click_wrapper_is_unchanged():
    with iers.conf.set_temp("auto_download", False):
        ra, dec = click_to_icrs([0, 1, 0], OBSERVER, AT)
        coordinate = directions_to_icrs([[0, 1, 0]], OBSERVER, AT)
    assert (ra, dec) == (float(coordinate.ra.deg[0]), float(coordinate.dec.deg[0]))
