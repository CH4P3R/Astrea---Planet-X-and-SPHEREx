"""Translate data-access errors into stable HTTP responses."""

import logging
import math

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.integrations.cutout_store import CacheError, UnknownImageError
from app.integrations.irsa import ArchiveError, ArchiveTimeout, SearchTooBroad
from app.integrations.catalog import CatalogError
from app.services.sky import EarthOrientationUnavailable
from app.services.fits_image import InvalidFitsError
from app.services.image_geometry import MeshError, SelectionTooLarge, SelectionTooSmall

logger = logging.getLogger(__name__)


def register_exception_handlers(app: FastAPI) -> None:
    mappings = {
        CatalogError: (502, "The star catalog could not be retrieved. Please retry."),
        EarthOrientationUnavailable: (422, "This time is outside the available Earth-orientation data. Choose a recent date or refresh IERS data."),
        UnknownImageError: (404, "Unknown image. Run an image search first."),
        SearchTooBroad: (422, "Too many archive matches. Narrow start_time/end_time and retry."),
        ArchiveTimeout: (504, "IRSA timed out. Please retry."),
        ArchiveError: (502, "IRSA data could not be retrieved. Please retry."),
        InvalidFitsError: (502, "IRSA returned an unsupported or invalid FITS image."),
        MeshError: (422, "This image's WCS cannot be projected accurately. Try a smaller size."),
        SelectionTooLarge: (422, None),
        SelectionTooSmall: (422, None),
        CacheError: (503, "The local image cache is unavailable."),
    }

    async def handle_error(request: Request, error: Exception) -> JSONResponse:
        status, detail = next(mappings[cls] for cls in type(error).__mro__ if cls in mappings)
        if status >= 500:
            logger.error("Image request failed: %s", request.url.path,
                         exc_info=(type(error), error, error.__traceback__))
        return JSONResponse(status_code=status, content={"detail": detail if detail is not None else str(error)})

    for error_type in mappings:
        app.add_exception_handler(error_type, handle_error)
    app.add_exception_handler(RequestValidationError, handle_validation_error)


def _json_safe(value):
    """Validation errors echo the input; NaN and infinity must become text to be valid JSON."""
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    return value


async def handle_validation_error(request: Request, error: RequestValidationError) -> JSONResponse:
    """FastAPI's usual 422 body, also when the rejected input is NaN or infinity."""
    return JSONResponse(status_code=422, content={"detail": _json_safe(jsonable_encoder(error.errors()))})
