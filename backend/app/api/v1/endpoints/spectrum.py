"""Spectrum of a sky position, measured on demand from the archive's exposures."""

import asyncio
from threading import Event
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import get_spectrum_service
from app.integrations.irsa import SearchTooBroad
from app.schemas.spectrum import SpectrumQuery, SpectrumResponse
from app.services.spectrum import SpectrumService

router = APIRouter(tags=["spectrum"])
Service = Annotated[SpectrumService, Depends(get_spectrum_service)]


@router.get("/spectrum", response_model=SpectrumResponse)
async def spectrum(request: Request, query: Annotated[SpectrumQuery, Query()], service: Service):
    """Photometry of the position on every exposure one detector took of it (PSF fit, or aperture).

    One point per exposure. Measurements are kept in memory, so repeats are fast.
    """
    cancelled = Event()
    job = asyncio.create_task(run_in_threadpool(
        service.spectrum, query.ra_deg, query.dec_deg, query.detector,
        float(query.radius_px), query.method, cancelled=cancelled,
    ))
    try:
        while not job.done():
            await asyncio.wait({job}, timeout=0.1)
            if not job.done() and await request.is_disconnected():
                # In-flight archive reads finish within their existing timeout;
                # queued exposures must not start after the browser leaves.
                return Response(status_code=499)
        return await job
    except SearchTooBroad as error:
        raise HTTPException(
            status_code=422,
            detail="Too many observations to complete this spectrum. Try another sky position.",
        ) from error
    finally:
        cancelled.set()
        if not job.done():
            job.cancel()
        # Retrieve exceptions even if the client disconnected during completion.
        await asyncio.gather(job, return_exceptions=True)
