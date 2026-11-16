"""Complete, bounded and cached observation-day discovery for one sky position."""

from collections import Counter, OrderedDict
from datetime import date
import math
from threading import Lock
import time

from astropy.time import Time

from app.integrations.irsa import ArchiveTimeout, IrsaClient, SearchTooBroad
from app.schemas.images import ImageAvailabilityQuery, ImageAvailabilityResponse, ObservationDay


CACHE_TTL_SECONDS = 15 * 60
CACHE_MAX_ENTRIES = 128
MAX_INTERVAL_REQUESTS = 64
MIN_INTERVAL_DAYS = 1 / 24  # Split dense days too, but stop at an hour.


class AvailabilityTooBroad(SearchTooBroad):
    """The bounded metadata search could not produce a complete yearly index."""


class ObservationAvailability:
    """Cache only complete yearly indexes; never turn an archive failure into no data."""

    def __init__(self):
        self._cache = OrderedDict()
        self._cache_lock = Lock()
        self._query_locks = [Lock() for _ in range(16)]

    def get(self, query: ImageAvailabilityQuery, archive: IrsaClient) -> ImageAvailabilityResponse:
        # Exact coordinates preserve the same footprint semantics as image search.
        key = (query.ra_deg, query.dec_deg, query.detector, query.year)
        with self._query_locks[hash(key) % len(self._query_locks)]:
            with self._cache_lock:
                cached = self._cache.get(key)
                if cached is not None and time.monotonic() < cached[0]:
                    self._cache.move_to_end(key)
                    return cached[1].model_copy(deep=True)
                self._cache.pop(key, None)
            result = self._discover(query, archive)
            with self._cache_lock:
                self._cache[key] = (time.monotonic() + CACHE_TTL_SECONDS, result)
                self._cache.move_to_end(key)
                while len(self._cache) > CACHE_MAX_ENTRIES:
                    self._cache.popitem(last=False)
            return result.model_copy(deep=True)

    @staticmethod
    def _discover(query: ImageAvailabilityQuery, archive: IrsaClient) -> ImageAvailabilityResponse:
        start = float(Time(date(query.year, 1, 1).isoformat(), scale="utc").mjd)
        end = float(Time(date(query.year + 1, 1, 1).isoformat(), scale="utc").mjd)
        deadline = time.monotonic() + archive.budget_seconds
        pending = [(start, end)]
        seen = set()
        days = Counter()
        requests = 0
        while pending:
            if time.monotonic() >= deadline:
                raise ArchiveTimeout("IRSA yearly availability search timed out.")
            if requests >= MAX_INTERVAL_REQUESTS:
                raise AvailabilityTooBroad("This region is too dense to index a complete year.")
            lower, upper = pending.pop()
            requests += 1
            try:
                rows = archive.search_all(
                    ra_deg=query.ra_deg, dec_deg=query.dec_deg, detector=query.detector,
                    start_mjd=lower, end_mjd=upper, deadline=deadline,
                )
            except SearchTooBroad as error:
                if upper - lower <= MIN_INTERVAL_DAYS:
                    raise AvailabilityTooBroad("This region is too dense to index a complete year.") from error
                middle = (lower + upper) / 2
                pending.extend(((middle, upper), (lower, middle)))
                continue
            for row in rows:
                observed = row.observed_start_mjd
                # SIA TIME uses overlapping, inclusive intervals. The calendar is
                # half-open: Jan 1 of the following year never belongs to this one.
                if (observed is None or not math.isfinite(observed)
                        or not lower <= observed < upper
                        or (query.detector is not None and row.detector != query.detector)
                        or row.source_url in seen):
                    continue
                seen.add(row.source_url)
                # Floor the UTC MJD before formatting: default millisecond ISO
                # precision can round a late exposure into the following day.
                day = Time(math.floor(observed), format="mjd", scale="utc").to_value("iso", subfmt="date")
                days[day] += 1
        return ImageAvailabilityResponse(
            year=query.year,
            days=[ObservationDay(date=day, count=count) for day, count in sorted(days.items())],
        )
