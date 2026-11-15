"""Per-application service access, overridable by FastAPI tests."""

from fastapi import Request

from app.services.images import ImageService


def get_image_service(request: Request) -> ImageService:
    return request.app.state.image_service


def get_star_service(request: Request):
    return request.app.state.star_service


def get_target_service(request: Request):
    return request.app.state.target_service
