"""Yearly metadata availability, with no IRSA network or FITS downloads."""

import asyncio
from dataclasses import replace
from unittest.mock import patch

from astropy.table import Table
from astropy.time import Time
import httpx
import numpy as np
import pytest
import requests

from app.application import create_app
from app.core.config import Settings
from app.integrations.irsa import ArchiveError, ArchiveImage, ArchiveTimeout, IrsaClient, SearchTooBroad
from app.schemas.images import ImageAvailabilityQuery
from app.services import image_availability
from app.services.image_availability import ObservationAvailability


PARAMS = {"ra_deg": 210.80227, "dec_deg": 54.34895, "year": 2024, "detector": 2}
SOURCE = "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/image.fits"


def mjd(value):
    return float(Time(value, scale="utc").mjd)


def image(name, at, detector=2):
    at = mjd(at) if isinstance(at, str) else at
    return ArchiveImage(SOURCE.replace("image.fits", f"{name}.fits"), name, detector, "dr1", at, at + 0.001)


class MetadataArchive:
    budget_seconds = 120

    def __init__(self, rows=()):
        self.rows = list(rows)
        self.calls = []
        self.error = None

    def search_all(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return [row for row in self.rows
                if kwargs["start_mjd"] <= row.observed_start_mjd <= kwargs["end_mjd"]]

    def download_cutout(self, **kwargs):
        pytest.fail("An availability query must never download a FITS file.")


def get(app, params):
    async def request():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            return await client.get("/api/v1/images/availability", params=params)
    return asyncio.run(request())


@pytest.fixture
def backend(tmp_path):
    app = create_app(Settings(cutout_cache_dir=tmp_path / "cutouts"))
    archive = MetadataArchive()
    app.state.image_service.archive = archive
    return app, archive


def test_calendar_keeps_more_than_100_exposures_and_handles_utc_year_and_leap_day(backend):
    app, archive = backend
    archive.rows = [image(str(i), "2024-02-29T12:00:00") for i in range(150)]
    archive.rows += [
        image("previous", "2023-12-31T23:59:59"),
        image("first", "2024-01-01"),
        image("last", np.nextafter(mjd("2025-01-01"), -np.inf)),
        image("following", "2025-01-01"),
        image("other-detector", "2024-02-29", 3),
        archive.rows[0],  # Duplicate URL, as when a collection is returned twice.
    ]
    response = get(app, PARAMS)
    assert response.status_code == 200, response.text
    assert response.json() == {
        "year": 2024, "complete": True, "time_scale": "UTC",
        "days": [{"date": "2024-01-01", "count": 1},
                 {"date": "2024-02-29", "count": 150},
                 {"date": "2024-12-31", "count": 1}],
    }
    call = archive.calls[0]
    assert call["start_mjd"] == mjd("2024-01-01")
    assert call["end_mjd"] == mjd("2025-01-01")
    assert call["detector"] == 2
    assert "limit" not in call
    # No selected image was registered, decoded or written as a cutout.
    assert not list(app.state.image_service.store.root.rglob("*.fits"))


def test_no_detector_includes_all_and_empty_success_is_complete(backend):
    app, archive = backend
    query = {key: value for key, value in PARAMS.items() if key != "detector"}
    archive.rows = [image("two", "2024-02-29", 2), image("three", "2024-02-29", 3)]
    assert get(app, query).json()["days"] == [{"date": "2024-02-29", "count": 2}]
    assert archive.calls[0]["detector"] is None
    assert get(app, query | {"year": 2023}).json() == {
        "year": 2023, "days": [], "complete": True, "time_scale": "UTC",
    }


@pytest.mark.parametrize("invalid", [
    {"ra_deg": "nan"}, {"ra_deg": 360}, {"dec_deg": -91},
    {"year": 0}, {"year": 9999}, {"year": "2024.5"},
    {"detector": 0}, {"detector": 7}, {"size_deg": 0.1},
])
def test_invalid_calendar_queries_do_not_contact_archive(backend, invalid):
    app, archive = backend
    assert get(app, PARAMS | invalid).status_code == 422
    assert archive.calls == []


@pytest.mark.parametrize("error,status", [(ArchiveError, 502), (ArchiveTimeout, 504)])
def test_failed_calendar_is_an_error_and_is_not_cached(backend, error, status):
    app, archive = backend
    archive.error = error("upstream failure")
    response = get(app, PARAMS)
    assert response.status_code == status
    assert "days" not in response.json()
    archive.error = None
    archive.rows = [image("recovered", "2024-01-02")]
    assert get(app, PARAMS).json()["days"] == [{"date": "2024-01-02", "count": 1}]
    assert len(archive.calls) == 2


def test_overflow_splits_interval_and_deduplicates_boundary_with_shared_deadline():
    lower, upper = mjd("2024-01-01"), mjd("2025-01-01")
    middle = (lower + upper) / 2
    archive = MetadataArchive([image("a", lower), image("b", middle), image("c", upper - 1)])
    original = archive.search_all

    def search(**kwargs):
        if kwargs["end_mjd"] - kwargs["start_mjd"] > 183:
            archive.calls.append(kwargs)
            raise SearchTooBroad("overflow")
        return original(**kwargs)

    archive.search_all = search
    result = ObservationAvailability().get(ImageAvailabilityQuery(**PARAMS), archive)
    assert sum(day.count for day in result.days) == 3
    assert len(archive.calls) == 3
    assert [(call["start_mjd"], call["end_mjd"]) for call in archive.calls] == [
        (lower, upper), (lower, middle), (middle, upper),
    ]
    assert len({call["deadline"] for call in archive.calls}) == 1
    assert all(call["detector"] == 2 for call in archive.calls)


def test_persistent_overflow_stops_at_request_budget_and_returns_422(backend, monkeypatch):
    app, archive = backend
    archive.error = SearchTooBroad("overflow")
    monkeypatch.setattr(image_availability, "MAX_INTERVAL_REQUESTS", 3)
    response = get(app, PARAMS)
    assert response.status_code == 422
    assert "days" not in response.json()
    assert len(archive.calls) == 3


def test_wall_clock_deadline_stops_before_another_split():
    archive = MetadataArchive()
    archive.error = SearchTooBroad("overflow")
    with patch("app.services.image_availability.time.monotonic", side_effect=[10, 10, 131]):
        with pytest.raises(ArchiveTimeout):
            ObservationAvailability._discover(ImageAvailabilityQuery(**PARAMS), archive)
    assert len(archive.calls) == 1


def test_complete_results_are_cached_by_position_detector_year_and_expire(monkeypatch):
    monkeypatch.setattr(image_availability, "CACHE_MAX_ENTRIES", 2)
    archive = MetadataArchive([image("a", "2024-01-01")])
    cache = ObservationAvailability()
    query = ImageAvailabilityQuery(**PARAMS)
    with patch("app.services.image_availability.time.monotonic", return_value=10) as clock:
        first = cache.get(query, archive)
        first.days.clear()  # Caller mutations must not corrupt the cached result.
        assert len(cache.get(query, archive).days) == 1
        assert len(archive.calls) == 1
        cache.get(query.model_copy(update={"detector": 3}), archive)
        cache.get(query.model_copy(update={"ra_deg": query.ra_deg + 0.01}), archive)
        assert len(cache._cache) == 2
        cache.get(query, archive)  # Original evicted by bounded LRU.
        assert len(archive.calls) == 4
        clock.return_value = 10 + image_availability.CACHE_TTL_SECONDS
        cache.get(query, archive)
        assert len(archive.calls) == 5
        cache.get(query.model_copy(update={"year": 2023}), archive)
        assert len(archive.calls) == 6


def test_search_all_uses_real_sia_metadata_parser_without_public_list_cap():
    rows = [image(str(i), "2024-02-29") for i in range(150)]
    rows.append(replace(rows[0], source_url=SOURCE.replace("dr1", "future-release"), detector=3))
    table = Table({
        "access_url": [row.source_url for row in rows],
        "obs_id": [row.observation_id for row in rows],
        "energy_bandpassname": [f"SPHEREx-D{row.detector}" for row in rows],
        "t_min": [row.observed_start_mjd for row in rows],
        "t_max": [row.observed_end_mjd for row in rows],
    })
    with patch("app.integrations.irsa.Irsa") as irsa:
        client = irsa.return_value
        client._session = requests.Session()
        client.list_collections.return_value = Table({"collection": ["spherex_dr1", "spherex_future-release"]})
        client.query_sia.return_value = table
        result = ObservationAvailability().get(ImageAvailabilityQuery(**PARAMS), IrsaClient())
        assert result.days[0].count == 150
        kwargs = client.query_sia.call_args.kwargs
        assert kwargs["pos"] == (PARAMS["ra_deg"], PARAMS["dec_deg"], 1 / 3600)
        assert kwargs["TIME"] == f"{mjd('2024-01-01')} {mjd('2025-01-01')}"
        assert kwargs["maxrec"] == 10000
