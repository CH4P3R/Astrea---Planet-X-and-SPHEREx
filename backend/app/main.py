"""ASGI entry point: python -m uvicorn app.main:app."""

import logging

from app.application import create_app

app_logger = logging.getLogger("app")
if not app_logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(levelname)s:     %(name)s %(message)s"))
    app_logger.addHandler(handler)
    app_logger.setLevel(logging.INFO)

app = create_app()
