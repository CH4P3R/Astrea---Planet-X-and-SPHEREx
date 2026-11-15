"""Central application defaults; server options belong to Uvicorn."""

from dataclasses import dataclass
import math
import os
from pathlib import Path


# Flags that mark a sample as unusable for display or comparison. Names, not
# bit numbers, are the contract: each file states its own bit assignments.
DEFAULT_BAD_FLAGS = (
    "TRANSIENT", "OVERFLOW", "SUR_ERROR", "NONFUNC", "MISSING_DATA", "HOT", "COLD", "PERSIST",
)


@dataclass(frozen=True)
class Settings:
    app_name: str = "Astrea API"
    app_version: str = "0.1.0"
    api_prefix: str = "/api/v1"
    cutout_cache_dir: Path = Path(__file__).resolve().parents[2] / "data" / "image-cutouts"
    star_cache_path: Path = Path(__file__).resolve().parents[2] / "data" / "hipparcos-v1.json"
    targets_path: Path = Path(__file__).resolve().parents[2] / "targets.yaml"
    cors_origins: tuple[str, ...] = ("http://localhost:5173", "http://127.0.0.1:5173")
    # FLAGS names rejected by mask_flags=true. SOURCE is never masked.
    bad_flags: tuple[str, ...] = DEFAULT_BAD_FLAGS
    archive_budget_seconds: float = 120.0

    @classmethod
    def from_env(cls, environ=None) -> "Settings":
        """Defaults overridden by ASTREA_* environment variables; invalid values fail at startup.

        ASTREA_CACHE_DIR, ASTREA_STAR_CACHE, ASTREA_TARGETS_FILE: paths. ASTREA_CORS_ORIGINS and
        ASTREA_BAD_FLAGS: comma-separated lists. ASTREA_ARCHIVE_BUDGET_SECONDS:
        a positive number. Any other ASTREA_* name is rejected as a likely typo.
        """
        environ = os.environ if environ is None else environ
        parsers = {
            "ASTREA_CACHE_DIR": ("cutout_cache_dir", _path),
            "ASTREA_STAR_CACHE": ("star_cache_path", _path),
            "ASTREA_TARGETS_FILE": ("targets_path", _path),
            "ASTREA_CORS_ORIGINS": ("cors_origins", _items),
            "ASTREA_BAD_FLAGS": ("bad_flags", _flag_names),
            "ASTREA_ARCHIVE_BUDGET_SECONDS": ("archive_budget_seconds", _positive_seconds),
        }
        unknown = sorted(name for name in environ if name.startswith("ASTREA_") and name not in parsers)
        if unknown:
            raise ValueError(f"Unknown setting(s): {', '.join(unknown)}. Known: {', '.join(parsers)}.")
        values = {}
        for name, (field, parse) in parsers.items():
            if name in environ:
                try:
                    values[field] = parse(environ[name])
                except ValueError as error:
                    raise ValueError(f"{name}: {error}") from error
        return cls(**values)


def _path(text: str) -> Path:
    if not text.strip():
        raise ValueError("must not be empty.")
    return Path(text.strip()).expanduser()


def _items(text: str) -> tuple[str, ...]:
    items = tuple(item.strip() for item in text.split(",") if item.strip())
    if not items:
        raise ValueError("must list at least one value.")
    return items


def _flag_names(text: str) -> tuple[str, ...]:
    names = tuple(name.upper() for name in _items(text))
    if "SOURCE" in names:
        raise ValueError("SOURCE marks pixels on known sources and can never be masked.")
    return names


def _positive_seconds(text: str) -> float:
    try:
        value = float(text)
    except ValueError:
        raise ValueError(f"{text!r} is not a number.") from None
    if not math.isfinite(value) or value <= 0:
        raise ValueError("must be a positive number of seconds.")
    return value
