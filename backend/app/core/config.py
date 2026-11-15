"""Central application defaults; server options belong to Uvicorn."""

from dataclasses import dataclass
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
    cors_origins: tuple[str, ...] = ("http://localhost:5173", "http://127.0.0.1:5173")
    # FLAGS names rejected by mask_flags=true. SOURCE is never masked.
    bad_flags: tuple[str, ...] = DEFAULT_BAD_FLAGS
    archive_budget_seconds: float = 120.0
