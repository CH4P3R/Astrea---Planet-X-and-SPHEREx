"""Liveness probe for deploy targets and the demo watchdog."""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    """The process is up and serving this API."""
    return {"status": "ok"}
