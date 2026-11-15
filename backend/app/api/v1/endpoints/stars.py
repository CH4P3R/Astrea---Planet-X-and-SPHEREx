"""Catalog and observer-relative sky endpoints matching the prototype flow."""
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from app.api.dependencies import get_star_service
from app.schemas.sky import SkyRequest
from app.services.stars import StarService
from app.services.sky import calculate_sky
from app.services.sky_transport import SKY_MEDIA_TYPE, encode_sky

router = APIRouter(tags=["stars"])
Service = Annotated[StarService, Depends(get_star_service)]


@router.get("/stars")
def stars(service: Service, magnitude_limit: float = Query(default=7, ge=-2, le=15, allow_inf_nan=False)):
    """Hipparcos stars in ICRS at J1991.25, including magnitude and proper motion."""
    return service.selected(magnitude_limit)


@router.get("/star-catalog")
def star_catalog(service: Service):
    """Static rendering metadata and catalog version, shared by sky snapshots."""
    return service.metadata()


@router.post("/sky")
def sky(request: SkyRequest, service: Service):
    stars = service.selected(request.magnitude_limit)
    metadata = service.metadata()
    if request.catalog_version is not None and request.catalog_version != metadata["catalog_version"]:
        raise HTTPException(409, "The star catalog changed. Reload its metadata and retry.")
    if not stars:
        raise HTTPException(422, "No catalog stars match this magnitude limit.")
    snapshot = calculate_sky(stars, request.observer.model_dump(), request.at,
                             request.mode == "live", binary=request.format == "binary")
    snapshot.update(catalog_version=metadata["catalog_version"], magnitude_limit=request.magnitude_limit)
    if request.format == "binary":
        return Response(encode_sky(snapshot), media_type=SKY_MEDIA_TYPE)
    return snapshot
