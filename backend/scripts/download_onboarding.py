"""Download two real Barnard field cutouts for the guided tour"""

from datetime import datetime, timezone
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path

from astropy.io import fits
import requests


ROOT = Path(__file__).resolve().parents[1] / "data" / "onboarding"
SOURCES = [
    ("2025W33_2C_0321_1", 60902.864715, 60902.866047),
    ("2025W33_2C_0386_4", 60903.139858, 60903.141190),
]


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    requested = {"ra_deg": 269.4463, "dec_deg": 4.7679, "size_deg": 7 / 60, "frame": "ICRS"}
    observations = []
    for index, (obs_id, start, end) in enumerate(SOURCES):
        source = ("https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/"
                  f"2025W33_2C/l2b-v27-2026-228/3/level2_{obs_id}D3_spx_l2b-v27-2026-228.fits")
        filename = f"barnard_{index + 1}.fits"
        path = ROOT / filename
        if not path.exists():
            response = requests.get(source, params={"center": "269.4463,4.7679d", "size": str(7 / 60), "gzip": "false"}, timeout=(15, 120))
            response.raise_for_status()
            content = response.content
            if not content.startswith(b"SIMPLE  =") or len(content) > 10 * 1024 * 1024:
                raise ValueError("Unexpected archive response")
            with fits.open(BytesIO(content), memmap=False) as hdus:
                for name in ("IMAGE", "FLAGS", "VARIANCE", "ZODI"):
                    if hdus[name].data is None:
                        raise ValueError(f"Missing {name} plane")
                hdus.verify("exception")
            path.write_bytes(content)
        content = path.read_bytes()
        selection = {"archive": {"source_url": source, "observation_id": obs_id, "detector": 3,
                     "collection": "dr1", "observed_start_mjd": start, "observed_end_mjd": end},
                     "requested": requested}
        identifier = sha256(json.dumps({"onboarding": filename, "sha256": sha256(content).hexdigest()}, sort_keys=True).encode()).hexdigest()
        observations.append({"id": identifier, "file": filename, "sha256": sha256(content).hexdigest(), "selection": selection})
        print(f"{filename}: {len(content)} bytes, sha256={sha256(content).hexdigest()}", flush=True)
    manifest = {"target": "Barnard's Star", "retrieved_utc": datetime.now(timezone.utc).isoformat(),
                "position_note": "ICRS position near epoch 2025.6, propagated approximately from Gaia EDR3 J2000 position and proper motion in targets.yaml",
                "discovery_url": "https://irsa.ipac.caltech.edu/SIA?POS=CIRCLE+269.4463+4.7679+0.001&COLLECTION=spherex_dr1&RESPONSEFORMAT=CSV&MAXREC=10",
                "observations": observations}
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
