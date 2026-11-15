"""Load the shared Hipparcos catalog once and select stars by magnitude."""
from hashlib import sha256
import json
import logging
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import Lock

from app.integrations.catalog import (
    CATALOG_ID, CATALOG_FRAME, CATALOG_EPOCH, CATALOG_ROWS, CACHE_VERSION,
    MAX_MAGNITUDE, fetch_catalog,
)

logger = logging.getLogger(__name__)


class StarService:
    def __init__(self, cache_path: Path):
        self.cache_path = cache_path
        self._lock = Lock()
        self._stars = None
        self._metadata = None

    def _load(self):
        with self._lock:
            if self._stars is not None:
                return self._stars
            identity = {"catalog": CATALOG_ID, "version": CACHE_VERSION,
                        "frame": CATALOG_FRAME, "epoch": CATALOG_EPOCH,
                        "source_rows": CATALOG_ROWS}
            try:
                cached = json.loads(self.cache_path.read_text())
                if all(cached.get(k) == v for k, v in identity.items()) and cached.get("stars"):
                    self._stars = cached["stars"]
            except (OSError, ValueError, AttributeError):
                pass
            if self._stars is None:
                self._stars = fetch_catalog()
                temporary = None
                try:
                    self.cache_path.parent.mkdir(parents=True, exist_ok=True)
                    with NamedTemporaryFile(mode="w", dir=self.cache_path.parent, delete=False) as file:
                        temporary = Path(file.name)
                        json.dump({**identity, "stars": self._stars}, file, separators=(",", ":"), allow_nan=False)
                    temporary.replace(self.cache_path)
                except OSError:
                    logger.warning("Hipparcos is available in memory, but its disk cache could not be saved.")
                finally:
                    if temporary is not None:
                        temporary.unlink(missing_ok=True)
            digest = sha256(json.dumps(self._stars, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:20]
            self._metadata = {
                "catalog": CATALOG_ID, "catalog_version": f"hipparcos-v{CACHE_VERSION}-{digest}",
                "catalog_frame": CATALOG_FRAME, "catalog_epoch": CATALOG_EPOCH,
                "source_rows": CATALOG_ROWS, "usable_rows": len(self._stars),
                "stars": [{key: star[key] for key in (
                    "hipparcos_id", "common_name", "apparent_magnitude", "color_hex")}
                    for star in self._stars if star["apparent_magnitude"] <= MAX_MAGNITUDE],
            }
            return self._stars

    def selected(self, magnitude_limit):
        return [star for star in self._load() if star["apparent_magnitude"] <= magnitude_limit]

    def metadata(self):
        self._load()
        return self._metadata
