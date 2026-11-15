"""Prepare the cache for the acceptance targets: python -m app.warm [targets.yaml].

Online, each target is searched, up to --max-frames observations of one
detector are chosen across the returned dates, and each is loaded (metadata
and pixels) into the image cache. A manifest records what was chosen.
With --offline, the manifest's observations are checked in the cache without
any network access; searching itself still needs IRSA.
"""

import argparse
from collections import Counter
from dataclasses import dataclass, replace
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
from tempfile import NamedTemporaryFile

from app.core.config import Settings
from app.integrations.cutout_store import CacheError, CutoutStore, UnknownImageError
from app.integrations.irsa import ArchiveError, IrsaClient
from app.schemas.images import ImageSearchQuery, ImageSummary
from app.schemas.targets import Target
from app.services.fits_image import InvalidFitsError
from app.services.images import ImageService
from app.services.targets import TargetService

SEARCH_LIMIT = 100
LOAD_ERRORS = (ArchiveError, InvalidFitsError, CacheError, UnknownImageError)


class OfflineArchive:
    """Stands in for IrsaClient when the network must not be used."""

    def __getattr__(self, name):
        def refuse(*args, **kwargs):
            raise ArchiveError(f"Offline mode: IRSA was not contacted ({name}).")
        return refuse


@dataclass
class Report:
    name: str
    detector: int | None = None
    available: int = 0
    ready: int = 0
    fetched: int = 0
    cached: int = 0
    failed: int = 0
    span_days: float = 0.0
    has_more: bool = False
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None and self.failed == 0 and self.ready >= 2

    def line(self) -> str:
        detector = f"D{self.detector}" if self.detector else "D?"
        text = (f"{'OK' if self.ok else 'FAIL':<4} {self.name:<16} {detector:<3} {self.ready}/{self.available} ready"
                f"  span {self.span_days:7.1f} d  fetched {self.fetched}  cached {self.cached}  failed {self.failed}")
        if self.has_more:
            text += f"  (search capped at {SEARCH_LIMIT} newest results)"
        if self.error:
            text += f"  error: {self.error}"
        return text


def choose_detector(images: list[ImageSummary], requested: int | None) -> int | None:
    """The requested detector, else the one with most observations (ties: the higher, redder array)."""
    if requested is not None:
        return requested
    counts = Counter(image.detector for image in images if image.detector is not None)
    return max(counts, key=lambda detector: (counts[detector], detector)) if counts else None


def spread(images: list[ImageSummary], count: int) -> list[ImageSummary]:
    """Up to `count` observations across the time range: first, last and evenly spaced in between."""
    ordered = sorted(images, key=lambda image: image.observation.start_mjd)
    if len(ordered) <= count:
        return ordered
    first, last = ordered[0].observation.start_mjd, ordered[-1].observation.start_mjd
    chosen = []
    for step in range(count):
        target_time = first + (last - first) * step / (count - 1)
        remaining = [image for image in ordered if image not in chosen]
        chosen.append(min(remaining, key=lambda image: abs(image.observation.start_mjd - target_time)))
    return sorted(chosen, key=lambda image: image.observation.start_mjd)


def _load(service: ImageService, image_id: str, report: Report) -> bool:
    was_cached = service.store.metadata(image_id) is not None
    try:
        service.pixels(image_id)
    except LOAD_ERRORS:
        report.failed += 1
        return False
    report.ready += 1
    if was_cached:
        report.cached += 1
    else:
        report.fetched += 1
    return True


def _span(dates: list[float]) -> float:
    return max(dates) - min(dates) if len(dates) > 1 else 0.0


def warm_target(service: ImageService, target: Target, size_deg: float, max_frames: int) -> tuple[Report, dict]:
    report = Report(target.name)
    entry = {"name": target.name, "simbad_id": target.simbad_id,
             "query": {"ra_deg": target.search.ra_deg, "dec_deg": target.search.dec_deg, "size_deg": size_deg},
             "processing": "raw", "observations": []}
    try:
        result = service.search(ImageSearchQuery(
            ra_deg=target.search.ra_deg, dec_deg=target.search.dec_deg, size_deg=size_deg,
            detector=target.detector, limit=SEARCH_LIMIT))
    except LOAD_ERRORS as error:
        report.error = f"search failed: {error}"
        return report, entry
    report.has_more = result.has_more
    report.detector = choose_detector(result.images, target.detector)
    candidates = [image for image in result.images if image.detector == report.detector]
    report.available = len(candidates)
    entry.update(detector=report.detector, available=report.available, has_more=result.has_more)
    ready_dates = []
    for image in spread(candidates, max_frames):
        if _load(service, image.id, report):
            ready_dates.append(image.observation.start_mjd)
            entry["observations"].append({"id": image.id, "observation_id": image.observation_id,
                                          "start_utc": image.observation.start_utc,
                                          "start_mjd": image.observation.start_mjd})
    report.span_days = _span(ready_dates)
    return report, entry


def verify_offline(service: ImageService, entry: dict) -> Report:
    report = Report(entry["name"], detector=entry.get("detector"), available=len(entry["observations"]))
    dates = [observation["start_mjd"] for observation in entry["observations"]
             if _load(service, observation["id"], report)]
    report.span_days = _span(dates)
    return report


def _write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile("w", dir=path.parent, suffix=".tmp", delete=False) as handle:
        json.dump(data, handle, indent=2)
    os.replace(handle.name, path)


def main(argv=None, out=sys.stdout) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.warm", description=__doc__.splitlines()[0])
    parser.add_argument("targets", nargs="?", type=Path, help="targets file (default: settings.targets_path)")
    parser.add_argument("--only", action="append", metavar="NAME", help="warm only this target (repeatable)")
    parser.add_argument("--fov", type=float, help="cutout size in degrees (default: the file's size_deg)")
    parser.add_argument("--max-frames", type=int, default=12, help="observations per target (default 12)")
    parser.add_argument("--manifest", type=Path, help="manifest path (default: <cache parent>/warm-manifest.json)")
    parser.add_argument("--offline", action="store_true", help="verify the manifest's cached data without network")
    args = parser.parse_args(argv)
    if args.max_frames < 2:
        parser.error("--max-frames must be at least 2.")
    if args.fov is not None and not 0 < args.fov <= 0.5:
        parser.error("--fov must be greater than 0 and at most 0.5 degrees.")

    settings = Settings.from_env()
    if args.targets:
        settings = replace(settings, targets_path=args.targets)
    manifest_path = args.manifest or settings.cutout_cache_dir.parent / "warm-manifest.json"
    archive = OfflineArchive() if args.offline else IrsaClient(budget_seconds=settings.archive_budget_seconds)
    service = ImageService(archive=archive, store=CutoutStore(settings.cutout_cache_dir),
                           api_prefix=settings.api_prefix, bad_flags=settings.bad_flags)
    wanted = set(args.only or [])

    if args.offline:
        try:
            manifest = json.loads(manifest_path.read_text())
        except (OSError, ValueError) as error:
            print(f"Cannot read manifest {manifest_path}: {error}", file=out)
            return 1
        entries = [entry for entry in manifest["targets"] if not wanted or entry["name"] in wanted]
        reports = [verify_offline(service, entry) for entry in entries]
    else:
        targets = TargetService(settings.targets_path, settings.api_prefix).targets()
        chosen = [target for target in targets.targets if not wanted or target.name in wanted]
        unknown = wanted - {target.name for target in targets.targets}
        if unknown:
            parser.error(f"unknown target(s): {', '.join(sorted(unknown))}")
        size_deg = args.fov or targets.size_deg
        reports, entries = [], []
        for target in chosen:
            report, entry = warm_target(service, target, size_deg, args.max_frames)
            print(report.line(), file=out, flush=True)
            reports.append(report)
            entries.append(entry)
        _write_json(manifest_path, {"created_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                                    "epoch": targets.epoch, "targets": entries})
        print(f"Manifest: {manifest_path}", file=out)

    if args.offline:
        for report in reports:
            print(report.line(), file=out)
    failed = [report.name for report in reports if not report.ok]
    print(f"{len(reports) - len(failed)}/{len(reports)} targets ready"
          + (f"; not ready: {', '.join(failed)}" if failed else ""), file=out)
    return 1 if failed or not reports else 0


if __name__ == "__main__":
    sys.exit(main())
