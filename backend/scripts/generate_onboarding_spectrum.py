"""Rebuild the guide's spectrum from the bundled FITS, without network access.

Run from backend/ with its environment activated:
    python scripts/generate_onboarding_spectrum.py
    python scripts/generate_onboarding_spectrum.py --check

Barnard itself is saturated in both bundled exposures. This example measures
a nearby source maximum at pixel (32, 17), zero based, in barnard_1.fits. It
uses the live service's unchanged photometry and quality rules. These two
points demonstrate the controls; they are not a complete spectrum of Barnard.
"""

import argparse
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import re
import sys

import astropy.units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
import numpy as np


BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))

from app.integrations.irsa_ranges import Stamp  # noqa: E402
from app.schemas.spectrum import SpectrumResponse  # noqa: E402
from app.services.spectrum import ANNULUS, STAMP_HALF, measure  # noqa: E402


DATA = BACKEND / "data" / "onboarding"
OUTPUT = ROOT / "frontend/src/components/onboarding/data/spectrum.json"
REFERENCE_PIXEL = (32, 17)
RADIUS = 3.0
_SIP_CARD = re.compile(r"(A|B|AP|BP)_(ORDER|DMAX|\d+_\d+)$")


def local_stamp(path: Path, position: SkyCoord) -> Stamp:
    """Read a native 21-pixel window and the appropriate detector PSF locally."""
    with fits.open(path, memmap=False) as hdus:
        header = hdus["IMAGE"].header.copy()
        x, y = map(float, WCS(header).celestial.world_to_pixel(position))
        x0, y0 = int(np.floor(x + 0.5)) - STAMP_HALF, int(np.floor(y + 0.5)) - STAMP_HALF
        side = 2 * STAMP_HALF + 1
        if not (0 <= x0 and 0 <= y0 and x0 + side <= header["NAXIS1"]
                and y0 + side <= header["NAXIS2"]):
            raise ValueError(f"The teaching position falls outside {path.name}.")

        # A is the cutout's linear mapping to zero-based active detector pixels.
        # EPSF centres use that original detector grid, not the cutout grid.
        # Optical SIP terms must not distort this linear mapping.
        plain = fits.Header([card for card in header.cards if not _SIP_CARD.match(card.keyword)])
        if header["WCSNAMEA"].strip() != "0-based active pixel coordinates":
            raise ValueError("The cutout has no recognized detector-coordinate mapping.")
        detector_x, detector_y = WCS(plain, key="A").pixel_to_world_values(x, y)
        epsf = hdus["EPSF"].data
        zone = int(np.argmin((epsf["XCENTER"] - detector_x) ** 2
                            + (epsf["YCENTER"] - detector_y) ** 2))
        oversample = int(hdus["EPSF"].header["OVSMPX"])
        if oversample != int(hdus["EPSF"].header["OVSMPY"]):
            raise ValueError("The EPSF sampling differs between axes.")

        # measure() reads the same unmodified wavelength lookup extension.
        spectral = BytesIO()
        fits.HDUList([fits.PrimaryHDU(), hdus["WCS-WAVE"].copy()]).writeto(spectral)
        section = np.s_[y0:y0 + side, x0:x0 + side]
        return Stamp(
            header=header, flags_header=hdus["FLAGS"].header.copy(),
            x=x, y=y, x0=x0, y0=y0,
            image=np.array(hdus["IMAGE"].data[section]),
            variance=np.array(hdus["VARIANCE"].data[section]),
            flags=np.array(hdus["FLAGS"].data[section]),
            spectral_table=spectral.getvalue()[2880:],
            psf=np.array(epsf["EPSF"][zone], dtype=np.float64), psf_oversample=oversample,
        )


def generate() -> dict:
    manifest_path = DATA / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    observations = manifest["observations"]
    with fits.open(DATA / observations[0]["file"], memmap=False) as hdus:
        sky = WCS(hdus["IMAGE"].header).celestial.pixel_to_world(*REFERENCE_PIXEL)
    position = {"ra_deg": float(sky.ra.to_value(u.deg)),
                "dec_deg": float(sky.dec.to_value(u.deg)), "frame": "ICRS"}

    sources, stamps = [], []
    for observation in observations:
        path = DATA / observation["file"]
        digest = sha256(path.read_bytes()).hexdigest()
        if digest != observation["sha256"]:
            raise ValueError(f"Checksum does not match manifest: {path.name}")
        archive = observation["selection"]["archive"]
        if archive["detector"] != 3:
            raise ValueError("The teaching example only contains detector D3.")
        sources.append({"path": path.relative_to(ROOT).as_posix(), "sha256": digest,
                        "source_url": archive["source_url"], "observation_id": archive["observation_id"]})
        stamps.append((local_stamp(path, sky), archive))

    responses = {}
    for method in ("psf", "aperture"):
        points = []
        for stamp, archive in stamps:
            mjd = archive["observed_start_mjd"]
            points.append({
                **measure(stamp, RADIUS, method),
                "detector": archive["detector"], "observation_id": archive["observation_id"],
                "observed_mjd": mjd,
                "observed_utc": f"{Time(mjd, format='mjd', scale='utc').isot}Z",
                "source_url": archive["source_url"],
            })
        responses[method] = SpectrumResponse.model_validate({
            "position": position, "detector": 3, "method": method,
            "aperture": {"radius_px": RADIUS, "annulus_px": list(ANNULUS)},
            "exposures": {"found": len(stamps), "measured": len(points), "skipped": 0, "failed": 0},
            "points": sorted(points, key=lambda point: point["wavelength_um"]),
        }).model_dump(mode="json")

    return {
        "provenance": {
            "generator": Path(__file__).relative_to(ROOT).as_posix(),
            "manifest": manifest_path.relative_to(ROOT).as_posix(),
            "measurement": "app.services.spectrum.measure, unchanged PSF/aperture and quality rules",
            "reference_pixel": {"file": observations[0]["file"], "x": REFERENCE_PIXEL[0],
                                "y": REFERENCE_PIXEL[1], "origin": 0},
            "position_note": "A nearby source maximum in the Barnard field, not Barnard's Star. "
                             "Barnard's centre is saturated and excluded by the quality rules in both bundled exposures.",
            "limitations": "Two observations from detector D3 only, taken at different times. "
                           "Both retain the crowded-background warning; this is a control demonstration, not a complete spectrum.",
            "sources": sources,
        },
        "position": position, "detector": 3, "responses": responses,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify the checked-in fixture without modifying it.")
    args = parser.parse_args()
    content = json.dumps(generate(), indent=2, allow_nan=False) + "\n"
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != content:
            raise SystemExit("The guide spectrum differs from the local FITS measurements. Regenerate it.")
        print("Guide spectrum verified: 2 real D3 measurements per method, valid contract and finite values.")
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(content, encoding="utf-8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)} from local FITS; no network access.")


if __name__ == "__main__":
    main()
