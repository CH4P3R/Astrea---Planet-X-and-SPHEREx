"""Brief retries for archive failures that usually pass on their own.

IRSA occasionally answers 502/503 ("Server busy") or drops a connection. Those
clear within seconds, so a couple of spaced attempts spare the user an error.
Timeouts are not retried: an archive that did not answer in time rarely
answers at once, and repeating the wait would triple it.
"""

import time

import requests


RETRY_STATUS = frozenset({429, 500, 502, 503, 504})
RETRY_DELAYS = (1.0, 2.5)
MAX_RETRY_AFTER = 5.0


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


def with_retries(action, *, transient=is_transient, sleep=None):
    """Run action(); repeat it after a transient failure, then re-raise the last one."""
    for delay in (*RETRY_DELAYS, None):
        try:
            return action()
        except Exception as error:
            if delay is None or not transient(error):
                raise
            (sleep or time.sleep)(_delay(error, delay))
