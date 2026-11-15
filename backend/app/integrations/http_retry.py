"""Brief retries for archive failures that usually pass on their own.

IRSA occasionally answers 502/503 ("Server busy") or drops a connection. Those
clear within seconds, so a couple of spaced attempts spare the user an error.
Timeouts are not retried: an archive that did not answer in time rarely
answers at once, and repeating the wait would triple it.
"""

from contextlib import contextmanager
from contextvars import ContextVar
import time

import requests


RETRY_STATUS = frozenset({429, 500, 502, 503, 504})
RETRY_DELAYS = (1.0, 2.5)
MAX_RETRY_AFTER = 5.0
_retry_counter: ContextVar[list[int] | None] = ContextVar("archive_retry_counter", default=None)


@contextmanager
def count_retries():
    """Count the retry waits taken by with_retries inside this block: `with count_retries() as n: ... n[0]`."""
    counter = [0]
    token = _retry_counter.set(counter)
    try:
        yield counter
    finally:
        _retry_counter.reset(token)


def is_transient(error: BaseException) -> bool:
    if isinstance(error, requests.Timeout):
        return False
    if isinstance(error, requests.HTTPError):
        return error.response is not None and error.response.status_code in RETRY_STATUS
    return isinstance(error, (requests.ConnectionError, requests.exceptions.ChunkedEncodingError))


def _delay(error: BaseException, default: float) -> float:
    """Honour a short Retry-After; ignore long or unreadable ones."""
    response = getattr(error, "response", None)
    try:
        return min(max(float(response.headers["Retry-After"]), default), MAX_RETRY_AFTER)
    except (AttributeError, KeyError, TypeError, ValueError):
        return default


def timeout_until(deadline, connect=10.0, read=40.0):
    """(connect, read) timeouts that end by the deadline; Timeout once it has passed."""
    if deadline is None:
        return connect, read
    left = deadline - time.monotonic()
    if left <= 0:
        raise requests.Timeout("The archive download budget is exhausted.")
    return min(connect, left), min(read, left)


def with_retries(action, *, transient=is_transient, sleep=None, deadline=None):
    """Run action(); repeat it after a transient failure, then re-raise the last one.

    No wait starts that would end after `deadline` (a time.monotonic() value).
    """
    for delay in (*RETRY_DELAYS, None):
        try:
            return action()
        except Exception as error:
            if delay is None or not transient(error):
                raise
            wait = _delay(error, delay)
            if deadline is not None and time.monotonic() + wait >= deadline:
                raise
            if (counter := _retry_counter.get()) is not None:
                counter[0] += 1
            (sleep or time.sleep)(wait)
