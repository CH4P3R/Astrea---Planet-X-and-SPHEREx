"""Verified local FITS observations used by the real inspector during onboarding"""

from hashlib import sha256
import json
from pathlib import Path

from app.integrations.cutout_store import CacheError, UnknownImageError


class OnboardingCatalog:
    def __init__(self, root: Path | None = None):
        self.root = root or Path(__file__).resolve().parents[2] / "data" / "onboarding"

    def entries(self) -> list[dict]:
        try:
            return json.loads((self.root / "manifest.json").read_text(encoding="utf-8"))["observations"]
        except (OSError, ValueError, KeyError) as error:
            raise CacheError("Could not read the bundled onboarding catalog") from error

    def entry(self, identifier: str) -> dict:
        for entry in self.entries():
            if entry["id"] == identifier:
                return entry
        raise UnknownImageError("Unknown onboarding observation")

    def path(self, identifier: str) -> Path:
        entry = self.entry(identifier)
        path = self.root / entry["file"]
        if path.parent.resolve() != self.root.resolve() or path.suffix != ".fits":
            raise CacheError("Invalid onboarding FITS path")
        return path

    def content(self, identifier: str) -> bytes:
        try:
            content = self.path(identifier).read_bytes()
        except OSError as error:
            raise CacheError("Could not read the bundled onboarding FITS") from error
        if sha256(content).hexdigest() != self.entry(identifier)["sha256"]:
            raise CacheError("Bundled onboarding FITS checksum mismatch")
        return content
