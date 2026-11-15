"""Convert catalog directions to an observer's airless local sky."""

from datetime import timezone
import warnings

import astropy.units as u
from astropy.coordinates import AltAz, EarthLocation, FK5, SkyCoord
from astropy.time import Time
from astropy.utils import iers
from erfa import ErfaWarning
import numpy as np

SAMPLE_INTERVAL_SECONDS = 10
LIVE_WINDOW_SECONDS = 120
iers.conf.remote_timeout = 5


class EarthOrientationUnavailable(ValueError):
    pass


def horizon_vectors(altitude_rad, azimuth_rad):
    """Unit vectors in the renderer's convention: +X east, +Y up, -Z north."""
    horizontal = np.cos(altitude_rad)
    return np.stack((horizontal * np.sin(azimuth_rad), np.sin(altitude_rad),
                     -horizontal * np.cos(azimuth_rad)), axis=-1)


def catalog_coordinates(stars):
    hipparcos = "hipparcos_id" in stars[0]
    if any(("hipparcos_id" in star) != hipparcos for star in stars):
        raise ValueError("Catalog reference frames cannot be mixed in one sky snapshot.")
    return SkyCoord(
        ra=[star["right_ascension_deg"] for star in stars] * u.deg,
        dec=[star["declination_deg"] for star in stars] * u.deg,
        pm_ra_cosdec=[star["pm_ra_cosdec_arcsec_yr"] or 0 for star in stars] * u.arcsec / u.yr,
        pm_dec=[star["pm_dec_arcsec_yr"] or 0 for star in stars] * u.arcsec / u.yr,
        frame="icrs" if hipparcos else FK5(equinox=Time("J2000")),
        obstime=Time("J1991.25", scale="tt") if hipparcos else Time("J2000"),
    )


def observation_context(observer, at, live):
    """The same airless horizon and UTC samples drive stars and FITS overlays."""
    at = at.astimezone(timezone.utc)
    offsets = np.arange(0, LIVE_WINDOW_SECONDS + 1, SAMPLE_INTERVAL_SECONDS) if live else np.array([0])
    milliseconds = np.rint(at.timestamp() * 1000 + offsets * 1000).astype(np.int64)
    times = Time(milliseconds / 1000, format="unix", scale="utc")
    location = EarthLocation.from_geodetic(
        lon=observer["longitude_deg"] * u.deg,
        lat=observer["latitude_deg"] * u.deg,
        height=observer["elevation_m"] * u.m,
    )

    # Do not silently extrapolate Earth rotation outside the available IERS data.
    try:
        earth_table = iers.earth_orientation_table.get()
        _, status = earth_table.ut1_utc(times, return_status=True)
        if np.any(status < 0):
            raise EarthOrientationUnavailable("This time is outside the available Earth-orientation data. Choose a recent date.")
    except (ValueError, OSError) as error:
        raise EarthOrientationUnavailable(f"Earth-orientation data unavailable: {error}") from error

    frame = AltAz(obstime=times[:, None], location=location, pressure=0 * u.hPa)
    return milliseconds, times, frame, status


def calculate_sky(stars, observer, at, live, *, binary=False):
    milliseconds, times, frame, status = observation_context(observer, at, live)
    coordinates = catalog_coordinates(stars)
    with warnings.catch_warnings():
        # Angular-only proper motion: no stellar distance/parallax is assumed.
        warnings.filterwarnings("ignore", message=".*pmsafe.*distance overridden.*", category=ErfaWarning)
        moved = coordinates.apply_space_motion(new_obstime=times[:, None])
    # Preserve the catalog frame after motion; FITS directions also enter as ICRS.
    directions = SkyCoord(ra=moved.ra, dec=moved.dec, frame=coordinates.frame.replicate_without_data())
    horizontal = directions.transform_to(frame)
    vectors = horizon_vectors(horizontal.alt.rad, horizontal.az.rad)
    if not np.all(np.isfinite(vectors)):
        raise ValueError("The coordinate calculation produced invalid directions.")

    return {
        "observer": observer,
        "mode": "live" if live else "paused",
        "coordinate_frame": "AltAz",
        "catalog_frame": "ICRS" if "hipparcos_id" in stars[0] else "FK5/J2000",
        "catalog_epoch": "J1991.25" if "hipparcos_id" in stars[0] else "J2000",
        "refraction": False,
        "earth_orientation": "predicted" if np.any(status == iers.FROM_IERS_A_PREDICTION) else "measured",
        "sample_times_ms": milliseconds.tolist(),
        "star_count": len(stars),
        "directions": (vectors.reshape(len(times), -1).astype("<f4") if binary
                       else np.round(vectors.reshape(len(times), -1), 9).tolist()),
        **({} if binary else {"stars": [{key: star[key] for key in (
            "hipparcos_id" if "hipparcos_id" in star else "harvard_revised_id",
            "common_name", "apparent_magnitude", "color_hex",
        )} for star in stars]}),
        "proper_motion_count": sum(
            star["pm_ra_cosdec_arcsec_yr"] is not None and star["pm_dec_arcsec_yr"] is not None
            for star in stars
        ),
        "limitations": "No atmospheric refraction, stellar parallax, terrain, or daylight visibility model.",
    }
