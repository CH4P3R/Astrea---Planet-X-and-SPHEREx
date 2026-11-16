"""Compose the HTTP application without starting the server."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from app.services.stars import StarService

from app.api.errors import register_exception_handlers
from app.api.v1.router import api_router
from app.core.config import Settings
from app.integrations.cutout_store import CutoutStore
from app.integrations.irsa import IrsaClient
from app.services.images import ImageService
from app.services.spectrum import SpectrumService


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build an independent application instance for Uvicorn or tests."""
    settings = settings if settings is not None else Settings()
    app = FastAPI(title=settings.app_name, version=settings.app_version)
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins),
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type"])
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.state.star_service = StarService(settings.star_cache_path)
    archive = IrsaClient(budget_seconds=settings.archive_budget_seconds)
    app.state.image_service = ImageService(
        archive=archive, store=CutoutStore(settings.cutout_cache_dir),
        api_prefix=settings.api_prefix, bad_flags=settings.bad_flags,
    )
    app.state.spectrum_service = SpectrumService(archive)
    register_exception_handlers(app)
    app.include_router(api_router, prefix=settings.api_prefix)
    return app
