"""Spectrum of a sky position, measured on demand from the archive's exposures."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import get_spectrum_service
from app.schemas.spectrum import SpectrumQuery, SpectrumResponse
from app.services.spectrum import SpectrumService

router = APIRouter(tags=["spectrum"])
Service = Annotated[SpectrumService, Depends(get_spectrum_service)]


@router.get("/spectrum", response_model=SpectrumResponse)
def spectrum(query: Annotated[SpectrumQuery, Query()], service: Service):
    """Aperture photometry of the position on every exposure one detector took of it.

    One point per exposure. Measurements are kept in memory, so repeats are fast.
    """
    return service.spectrum(query.ra_deg, query.dec_deg, query.detector, float(query.radius_px))
