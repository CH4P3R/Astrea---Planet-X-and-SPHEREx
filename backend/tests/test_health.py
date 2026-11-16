"""Liveness endpoint."""

from app.application import create_app
from test_images_api import get


def test_health_reports_ok():
    response = get(create_app(), "/api/v1/health")
    assert response.status_code == 200, response.text
    assert response.json() == {"status": "ok"}
