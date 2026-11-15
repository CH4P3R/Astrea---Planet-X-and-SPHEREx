"""Image discovery and access; scientific work stays in the service layer."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from fastapi.responses import FileResponse

from app.api.dependencies import get_image_service
from app.schemas.images import ImageMetadata, ImageSearchQuery, ImageSearchResponse
from app.services.images import ImageService
from app.schemas.sky import ClickSearchRequest, ProjectionRequest
from app.services.image_geometry import click_to_icrs, project_image

router = APIRouter(prefix="/images", tags=["images"])
Service = Annotated[ImageService, Depends(get_image_service)]
ImageId = Annotated[str, Path(pattern=r"^[0-9a-f]{64}$", description="Cutout ID returned by image search.")]


@router.get("", response_model=ImageSearchResponse)
def search_images(query: Annotated[ImageSearchQuery, Query()], service: Service):
    """Search DR1 and QR3 observations, newest first, without downloading FITS."""
    return service.search(query)


@router.get("/{image_id}", response_model=ImageMetadata)
def image_metadata(image_id: ImageId, service: Service):
    """Load a selected cutout and return its dimensions, WCS and provenance."""
    return service.metadata(image_id)


@router.get(
    "/{image_id}/pixels", response_class=FileResponse,
    responses={200: {"content": {"application/octet-stream": {
        "schema": {"type": "string", "format": "binary"}}},
        "description": "Unmodified IMAGE values. Decode with the dtype, byte order and shape from the metadata endpoint."}},
)
def image_pixels(image_id: ImageId, service: Service):
    """Return contiguous little-endian floats; preserve NaN, infinity and negatives."""
    return FileResponse(service.pixels(image_id), media_type="application/octet-stream")


@router.post("/search", response_model=ImageSearchResponse)
def search_from_click(request: ClickSearchRequest, service: Service):
    """Convert the local-sky click to ICRS and discover available FITS observations."""
    ra, dec = click_to_icrs(request.direction, request.observer.model_dump(), request.at)
    return service.search(ImageSearchQuery(
        ra_deg=ra, dec_deg=dec, size_deg=request.size_arcmin / 60,
        detector=request.detector, limit=request.limit,
        start_time=request.start_time, end_time=request.end_time,
    ))


@router.post("/load/{image_id}", response_model=ImageMetadata)
def load_image(image_id: ImageId, service: Service):
    """Download/decode the selected FITS cutout, or reuse its cache."""
    return service.metadata(image_id)


@router.post("/{image_id}/projection")
def image_projection(image_id: ImageId, request: ProjectionRequest, service: Service):
    """Project the image WCS mesh into the same local frame as the stars."""
    return project_image(service.metadata(image_id), request.observer.model_dump(),
                         request.at, request.mode == "live")
