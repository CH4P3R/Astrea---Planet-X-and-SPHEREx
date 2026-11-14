"""Central application defaults; server options belong to Uvicorn."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    app_name: str = "Astrea API"
    app_version: str = "0.1.0"
    api_prefix: str = "/api/v1"
