"""Compose the HTTP application without starting the server."""

from fastapi import FastAPI

from app.api.v1.router import api_router
from app.core.config import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build an independent application instance for Uvicorn or tests."""
    settings = settings if settings is not None else Settings()
    app = FastAPI(title=settings.app_name, version=settings.app_version)
    app.include_router(api_router, prefix=settings.api_prefix)
    return app
