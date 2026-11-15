"""Hipparcos acquisition and parsing, using the prototype's ICRS convention."""
import astropy.units as u
from astroquery.vizier import Vizier
import numpy as np

CATALOG_ID = "I/239/hip_main"
CATALOG_FRAME = "ICRS"
CATALOG_EPOCH = "J1991.25"
CATALOG_ROWS = 118218
MAX_MAGNITUDE = 15
CACHE_VERSION = 1

class CatalogError(Exception):
    """A complete, usable star catalog could not be loaded."""

def finite_number(value):
    """Missing measurements remain missing; zero is a valid measurement."""
    if value is None or np.ma.is_masked(value):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if np.isfinite(number) else None

def color_from_bv(value):
    if value is None:
        return "#ffffff"
    for limit, color in [(0, "#9bb0ff"), (0.3, "#bbccff"), (0.6, "#f8f9ff"),
                         (0.8, "#ffffed"), (1.4, "#ffd2a1")]:
        if value < limit:
            return color
    return "#ffcc6f"

def proper_motion(row, column, default_unit=u.arcsec / u.yr):
    value = finite_number(row.get(column))
    if value is None:
        return None
    # Read the response's unit rather than assuming arcsec versus mas.
    unit = getattr(row._table[column], "unit", None) or default_unit
    return float((value * u.Unit(unit)).to_value(u.arcsec / u.yr))

def parse_hipparcos_catalog(table):
    stars = []
    seen = set()
    for row in table:
        # Use the original epoch columns, not CDS's derived epoch-2000 columns.
        ra = finite_number(row.get("RAICRS"))
        dec = finite_number(row.get("DEICRS"))
        magnitude = finite_number(row.get("Vmag"))
        identifier = finite_number(row.get("HIP"))
        if (ra is None or dec is None or magnitude is None or identifier is None
                or not 0 <= ra < 360 or not -90 <= dec <= 90
                or identifier <= 0 or not identifier.is_integer()):
            continue
        hip = int(identifier)
        if hip in seen:
            raise RuntimeError("Hipparcos returned a duplicate HIP identifier.")
        seen.add(hip)
        bv = finite_number(row.get("B-V"))
        stars.append({
            "hipparcos_id": hip,
            "common_name": f"HIP {hip}",
            "right_ascension_deg": ra,
            "declination_deg": dec,
            "apparent_magnitude": magnitude,
            "bv_color_index": bv,
            "color_hex": color_from_bv(bv),
            # Hipparcos pmRA already includes cos(dec); its native unit is mas/yr.
            "pm_ra_cosdec_arcsec_yr": proper_motion(row, "pmRA", u.mas / u.yr),
            "pm_dec_arcsec_yr": proper_motion(row, "pmDE", u.mas / u.yr),
        })
    if not stars:
        raise RuntimeError("Hipparcos returned no usable positions and magnitudes.")
    # Every magnitude selection is a prefix of this stable order, on both sides.
    return sorted(stars, key=lambda star: (star["apparent_magnitude"], star["hipparcos_id"]))


def fetch_catalog():
    query = Vizier(columns=["HIP", "RAICRS", "DEICRS", "Vmag", "B-V", "pmRA", "pmDE"],
                   row_limit=-1, vizier_server="vizier.cfa.harvard.edu")
    query.TIMEOUT = 30
    try:
        result = query.query_constraints(catalog=CATALOG_ID)
        if not result or len(result[0]) != CATALOG_ROWS:
            raise CatalogError("The Hipparcos download is empty or incomplete.")
        return parse_hipparcos_catalog(result[0])
    except CatalogError:
        raise
    except Exception as exc:
        raise CatalogError("Hipparcos could not be retrieved from VizieR.") from exc
