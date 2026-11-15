"""SPHEREx discovery and bounded cutout downloads from the IRSA archive.

SIA discovery follows notebooks/01-data-overview. Only current
DR1/QR3 Level 2 FITS products are offered; search never downloads the images.
"""

from dataclasses import dataclass
import math
import re
import time
import warnings
from urllib.parse import urlsplit

from astroquery.ipac.irsa import Irsa
import numpy as np
from pyvo.dal.exceptions import DALAccessError, DALOverflowWarning
import requests


ARCHIVE_ORIGIN = "https://irsa.ipac.caltech.edu"
MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024
DOWNLOAD_SECONDS = 90
MAX_SEARCH_ROWS = 10000
SIA_COLLECTIONS = ("spherex_dr1", "spherex_dr1_deep", "spherex_qr3", "spherex_qr3_deep")
_IMAGE_PATH = re.compile(r"/ibe/data/spherex/(dr1|qr3)/level2/[A-Za-z0-9_./-]+\.fits")


class ArchiveError(Exception):
    """IRSA could not supply a usable response."""


class ArchiveTimeout(ArchiveError):
    """IRSA exceeded the network or download deadline."""


class SearchTooBroad(ArchiveError):
    """The archive truncated the search; narrower dates are required."""


@dataclass(frozen=True)
class ArchiveImage:
    source_url: str
    observation_id: str | None
    detector: int | None
    collection: str
    observed_start_mjd: float | None
    observed_end_mjd: float | None


def _image_url(url: str) -> tuple[str, str]:
    """Accept only unmodified archive URLs produced by our SIA search."""
    parts = urlsplit(url)
    match = _IMAGE_PATH.fullmatch(parts.path)
    if (
        parts.scheme != "https"
        or parts.netloc != "irsa.ipac.caltech.edu"
        or parts.query
        or parts.fragment
        or match is None
        or any(part in (".", "..", "") for part in parts.path.split("/")[1:])
    ):
        raise ArchiveError("IRSA returned an unsupported image URL.")
    return url, match.group(1)


def _number(value) -> float | None:
    if value is None or np.ma.is_masked(value):
        return None
    result = float(value)
    return result if math.isfinite(result) else None


def _text(value) -> str | None:
    if value is None or np.ma.is_masked(value):
        return None
    return value.decode("utf-8") if isinstance(value, bytes) else str(value)


def _coordinates(ra_deg: float, dec_deg: float) -> None:
    if not (math.isfinite(ra_deg) and 0 <= ra_deg < 360):
        raise ValueError("ra_deg must be finite and within [0, 360).")
    if not (math.isfinite(dec_deg) and -90 <= dec_deg <= 90):
        raise ValueError("dec_deg must be finite and within [-90, 90].")


class _SiaAdapter(requests.adapters.HTTPAdapter):
    """Astroquery's VO client otherwise sends requests without a timeout."""

    def send(self, request, **kwargs):
        parts = urlsplit(request.url)
        if (parts.scheme != "https" or parts.netloc != "irsa.ipac.caltech.edu"
                or parts.path not in ("/SIA", "/SIA/", "/SIA/capabilities")):
            raise ArchiveError("IRSA attempted an unexpected SIA redirect.")
        if kwargs.get("timeout") is None:
            kwargs["timeout"] = (10, 60)
        return super().send(request, **kwargs)


class IrsaClient:
    def search(
        self,
        *,
        ra_deg: float,
        dec_deg: float,
        detector: int | None,
        limit: int,
        start_mjd: float | None = None,
        end_mjd: float | None = None,
    ) -> list[ArchiveImage]:
        """Return at most limit + 1 rows, newest first, to detect truncation.

        Date bounds are inclusive and apply to the observation start time.
        Fetch complete metadata before sorting, filtering, and limiting locally.
        """
        _coordinates(ra_deg, dec_deg)
        if type(limit) is not int or not 1 <= limit <= 100:
            raise ValueError("limit must be an integer from 1 to 100.")
        if detector is not None and (type(detector) is not int or not 1 <= detector <= 6):
            raise ValueError("detector must be an integer from 1 to 6.")
        for value in (start_mjd, end_mjd):
            if value is not None and not math.isfinite(value):
                raise ValueError("Date bounds must be finite MJD values.")
        if start_mjd is not None and end_mjd is not None and start_mjd > end_mjd:
            raise ValueError("The start date must not exceed the end date.")
        # SIA TIME tests interval overlap. Apply start-time semantics locally too.
        constraints = {}
        if start_mjd is not None or end_mjd is not None:
            constraints["TIME"] = f"{start_mjd if start_mjd is not None else '-Inf'} {end_mjd if end_mjd is not None else '+Inf'}"
        client = Irsa()
        client.sia_url = ARCHIVE_ORIGIN + "/SIA"
        try:
            with client._session, warnings.catch_warnings():
                warnings.simplefilter("error", DALOverflowWarning)
                client._session.mount("https://", _SiaAdapter())
                client._session.mount("http://", _SiaAdapter())
                table = client.query_sia(
                    # Follow the official introductory notebook: a one-arcsecond cone.
                    pos=(ra_deg, dec_deg, 1 / 3600),
                    collection=list(SIA_COLLECTIONS),
                    maxrec=MAX_SEARCH_ROWS,
                    **constraints,
                )
            if len(table) >= MAX_SEARCH_ROWS:
                raise SearchTooBroad("Narrow the observation dates to complete the search.")
            images = {}
            for row in table:
                source_url, collection = _image_url(_text(row["access_url"]) or "")
                band = re.fullmatch(r"SPHEREx-D([1-6])", _text(row["energy_bandpassname"]) or "")
                row_detector = int(band.group(1)) if band else None
                observed_start = _number(row["t_min"])
                if (observed_start is None
                        or (detector is not None and row_detector != detector)
                        or (start_mjd is not None and observed_start < start_mjd)
                        or (end_mjd is not None and observed_start > end_mjd)):
                    continue
                images[source_url] = ArchiveImage(
                    source_url=source_url,
                    observation_id=_text(row["obs_id"]),
                    detector=row_detector,
                    collection=collection,
                    observed_start_mjd=observed_start,
                    observed_end_mjd=_number(row["t_max"]),
                )
            return sorted(images.values(), key=lambda item: (
                -item.observed_start_mjd, item.source_url,
            ))[:limit + 1]
        except DALOverflowWarning as exc:
            raise SearchTooBroad("Narrow the observation dates to complete the search.") from exc
        except requests.Timeout as exc:
            raise ArchiveTimeout("IRSA search timed out. Please try again.") from exc
        except DALAccessError as exc:
            if isinstance(getattr(exc, "cause", None), requests.Timeout):
                raise ArchiveTimeout("IRSA search timed out. Please try again.") from exc
            raise ArchiveError("IRSA search is temporarily unavailable.") from exc
        except (requests.RequestException, KeyError, TypeError, ValueError) as exc:
            raise ArchiveError("IRSA returned an invalid search response.") from exc

    def download_cutout(
        self, source_url: str, ra_deg: float, dec_deg: float, size_deg: float
    ) -> bytes:
        """Download a selected cutout, rejecting redirects and oversized data."""
        source_url, _ = _image_url(source_url)
        _coordinates(ra_deg, dec_deg)
        if not math.isfinite(size_deg) or size_deg <= 0:
            raise ValueError("size_deg must be positive and finite.")
        params = {"center": f"{ra_deg:.12f},{dec_deg:.12f}d", "size": str(size_deg), "gzip": "false"}
        started = time.monotonic()
        try:
            with requests.get(
                source_url, params=params, stream=True,
                timeout=(10, 40), allow_redirects=False,
            ) as response:
                if 300 <= response.status_code < 400:
                    raise ArchiveError("IRSA returned an unexpected image redirect.")
                response.raise_for_status()
                chunks, total = [], 0
                for chunk in response.iter_content(chunk_size=65536):
                    if time.monotonic() - started > DOWNLOAD_SECONDS:
                        raise ArchiveTimeout("IRSA cutout download timed out.")
                    total += len(chunk)
                    if total > MAX_DOWNLOAD_BYTES:
                        raise ArchiveError("IRSA cutout exceeds the download limit. Request a smaller region.")
                    chunks.append(chunk)
                content = b"".join(chunks)
        except requests.Timeout as exc:
            raise ArchiveTimeout("IRSA cutout download timed out. Please try again.") from exc
        except requests.RequestException as exc:
            raise ArchiveError("IRSA cutout download is temporarily unavailable.") from exc
        if not content.startswith(b"SIMPLE  ="):
            raise ArchiveError("IRSA did not return a FITS cutout.")
        return content
