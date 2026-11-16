"""Register feature routers here as endpoints are implemented."""

from fastapi import APIRouter

from app.api.v1.endpoints.images import router as images_router
from app.api.v1.endpoints.spectrum import router as spectrum_router

from app.api.v1.endpoints.stars import router as stars_router

api_router = APIRouter()
api_router.include_router(images_router)
api_router.include_router(spectrum_router)

api_router.include_router(stars_router)
