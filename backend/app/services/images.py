"""Search orchestration and lazy decoding of selected cutouts."""

from dataclasses import asdict
from hashlib import sha256
import json
from pathlib import Path
from threading import Lock

from astropy.time import Time

from app.integrations.cutout_store import CutoutStore
from app.integrations.irsa import IrsaClient
from app.schemas.images import ImageMetadata, ImageSearchQuery, ImageSearchResponse, ImageSummary
from app.services.fits_image import decode_cutout


def _utc(mjd: float | None) -> str | None:
    return None if mjd is None else f"{Time(mjd, format='mjd', scale='utc').isot}Z"


class ImageService:
    def __init__(self, archive: IrsaClient, store: CutoutStore, api_prefix: str):
        self.archive = archive
        self.store = store
        self.api_prefix = api_prefix
        # A fixed-size lock pool avoids duplicate downloads within a worker.
        self._locks = [Lock() for _ in range(32)]

    def _summary(self, identifier: str, selection: dict) -> ImageSummary:
        archive = selection["archive"]
        start, end = archive["observed_start_mjd"], archive["observed_end_mjd"]
        return ImageSummary(
            id=identifier, observation_id=archive["observation_id"],
            detector=archive["detector"], collection=archive["collection"],
            source_url=archive["source_url"], requested=selection["requested"],
            observation={"start_mjd": start, "end_mjd": end,
                         "start_utc": _utc(start), "end_utc": _utc(end)},
            metadata_url=f"{self.api_prefix}/images/{identifier}",
            pixels_url=f"{self.api_prefix}/images/{identifier}/pixels",
        )

    def search(self, query: ImageSearchQuery) -> ImageSearchResponse:
        candidates = self.archive.search(
            ra_deg=query.ra_deg, dec_deg=query.dec_deg, detector=query.detector,
            limit=query.limit,
            start_mjd=float(Time(query.start_time).mjd) if query.start_time else None,
            end_mjd=float(Time(query.end_time).mjd) if query.end_time else None,
        )
        requested = {"ra_deg": query.ra_deg, "dec_deg": query.dec_deg,
                     "size_deg": query.size_deg, "frame": "ICRS"}
        images = []
        for candidate in candidates[:query.limit]:
            selection = {"archive": asdict(candidate), "requested": requested}
            # Include the format version, source and exact cutout geometry.
            identity = {"format_version": 1, "source_url": candidate.source_url,
                        "requested": requested}
            identifier = sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
            self.store.register(identifier, selection)
            images.append(self._summary(identifier, selection))
        return ImageSearchResponse(query=query, images=images, has_more=len(candidates) > query.limit)

    def metadata(self, identifier: str) -> ImageMetadata:
        selection = self.store.selection(identifier)
        lock = self._locks[int(identifier[:8], 16) % len(self._locks)]
        with lock:
            metadata = self.store.metadata(identifier)
            if metadata is None:
                request = selection["requested"]
                content = self.archive.download_cutout(
                    source_url=selection["archive"]["source_url"],
                    ra_deg=request["ra_deg"], dec_deg=request["dec_deg"], size_deg=request["size_deg"],
                )
                decoded = decode_cutout(content)
                # Validate the public contract before caching a completed image.
                metadata = ImageMetadata(**self._summary(identifier, selection).model_dump(),
                                         image=decoded.metadata).model_dump(mode="json")
                self.store.save_image(identifier, metadata, decoded.pixels)
            result = ImageMetadata.model_validate(metadata)
            # Route configuration can change without invalidating scientific data.
            result.metadata_url = f"{self.api_prefix}/images/{identifier}"
            result.pixels_url = f"{self.api_prefix}/images/{identifier}/pixels"
            return result

    def pixels(self, identifier: str) -> Path:
        self.metadata(identifier)
        return self.store.pixels_path(identifier)
