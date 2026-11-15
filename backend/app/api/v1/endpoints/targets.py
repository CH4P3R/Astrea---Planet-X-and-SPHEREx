"""Acceptance targets for demos and validation."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencies import get_target_service
from app.schemas.targets import TargetsResponse
from app.services.targets import TargetService

router = APIRouter(tags=["targets"])
Service = Annotated[TargetService, Depends(get_target_service)]


@router.get("/targets", response_model=TargetsResponse)
def targets(service: Service):
    """Acceptance targets with positions propagated to the SPHEREx epoch, ready for GET /images."""
    return service.targets()
