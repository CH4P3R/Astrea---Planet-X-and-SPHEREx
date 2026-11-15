"""Acceptance targets from targets.yaml, propagated by proper motion to the SPHEREx epoch."""

from pathlib import Path
from urllib.parse import urlencode
import warnings

import astropy.units as u
from astropy.coordinates import SkyCoord
from astropy.time import Time
from erfa import ErfaWarning
from pydantic import ValidationError
import yaml

from app.schemas.targets import TargetFile, TargetsResponse


class TargetFileError(ValueError):
    """targets.yaml is missing or invalid."""


def load_targets(path: Path) -> TargetFile:
    try:
        return TargetFile.model_validate(yaml.safe_load(path.read_text()))
    except (OSError, yaml.YAMLError, ValidationError) as error:
        raise TargetFileError(f"{path}: {error}") from error


def propagate(file: TargetFile) -> SkyCoord:
    """Positions at `file.epoch`, moved by proper motion only (no parallax or radial velocity)."""
    targets = file.targets
    catalog = SkyCoord(
        ra=[t.ra_deg for t in targets] * u.deg, dec=[t.dec_deg for t in targets] * u.deg,
        pm_ra_cosdec=[t.pmra_mas_yr for t in targets] * u.mas / u.yr,
        pm_dec=[t.pmdec_mas_yr for t in targets] * u.mas / u.yr,
        frame="icrs", obstime=Time("J2000.0"),
    )
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", message=".*pmsafe.*distance overridden.*", category=ErfaWarning)
        return catalog.apply_space_motion(new_obstime=Time(file.epoch, format="jyear"))


class TargetService:
    """Loads and propagates the targets once; an invalid file fails at startup."""

    def __init__(self, path: Path, api_prefix: str):
        file = load_targets(path)
        moved = propagate(file)
        targets = []
        for entry, position in zip(file.targets, moved):
            catalog = SkyCoord(ra=entry.ra_deg * u.deg, dec=entry.dec_deg * u.deg)
            ra, dec = float(position.ra.deg) % 360.0, float(position.dec.deg)
            search = {"ra_deg": round(ra, 7), "dec_deg": round(dec, 7), "size_deg": file.size_deg}
            targets.append({
                "name": entry.name, "simbad_id": entry.simbad_id, "expected": entry.expected,
                "detector": entry.detector, "reference": entry.reference,
                "catalog": {"ra_deg": entry.ra_deg, "dec_deg": entry.dec_deg,
                            "pmra_mas_yr": entry.pmra_mas_yr, "pmdec_mas_yr": entry.pmdec_mas_yr},
                "position": {"ra_deg": ra, "dec_deg": dec},
                "motion_arcsec": float(catalog.separation(SkyCoord(ra=ra * u.deg, dec=dec * u.deg)).arcsec),
                "search": search,
                "images_url": f"{api_prefix}/images?{urlencode(search)}",
            })
        self._response = TargetsResponse(epoch=file.epoch, size_deg=file.size_deg, targets=targets)

    def targets(self) -> TargetsResponse:
        return self._response
