"""Leaving a spectrum request must signal the worker and stop queued downloads."""

import asyncio
from concurrent.futures import CancelledError
from threading import Event

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.spectrum import spectrum
from app.integrations.irsa import SearchTooBroad
from app.schemas.spectrum import SpectrumQuery


class SlowService:
    def __init__(self):
        self.started = Event()
        self.stopped = Event()

    def spectrum(self, *args, cancelled):
        self.started.set()
        try:
            assert cancelled.wait(3), "The endpoint did not cancel its worker."
            raise CancelledError()
        finally:
            self.stopped.set()


class DisconnectingRequest:
    async def is_disconnected(self):
        return True


class ConnectedRequest:
    async def is_disconnected(self):
        return False


QUERY = SpectrumQuery(ra_deg=150, dec_deg=20, detector=2)


def test_disconnect_signals_spectrum_worker():
    service = SlowService()

    async def run():
        response = await asyncio.wait_for(spectrum(DisconnectingRequest(), QUERY, service), 2)
        assert response.status_code == 499

    asyncio.run(run())
    assert service.started.is_set()
    assert service.stopped.wait(1)


def test_server_cancellation_also_signals_spectrum_worker():
    service = SlowService()

    async def run():
        task = asyncio.create_task(spectrum(ConnectedRequest(), QUERY, service))
        for _ in range(100):
            if service.started.is_set():
                break
            await asyncio.sleep(0.01)
        assert service.started.is_set()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(run())
    assert service.stopped.wait(1)


def test_dense_spectrum_error_does_not_recommend_unsupported_date_filters():
    class DenseService:
        def spectrum(self, *args, **kwargs):
            raise SearchTooBroad("overflow")

    with pytest.raises(HTTPException) as raised:
        asyncio.run(spectrum(ConnectedRequest(), QUERY, DenseService()))
    assert raised.value.status_code == 422
    assert raised.value.detail == "Too many observations to complete this spectrum. Try another sky position."
