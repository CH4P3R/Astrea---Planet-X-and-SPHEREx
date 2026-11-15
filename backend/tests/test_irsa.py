"""Archive contract tests without network access."""

from unittest.mock import MagicMock, patch

from astropy.table import Table
import pytest
from pyvo.dal.exceptions import DALServiceError, DALOverflowWarning
import requests

from app.integrations import irsa_ranges
from app.integrations.irsa import ArchiveError, ArchiveTimeout, IrsaClient, SearchTooBroad


SOURCE = "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/week/run/2/image.fits"


@pytest.fixture(autouse=True)
def cutout_service_only():
    """These tests cover the cutout service, the fallback when byte ranges are unavailable.

    Partial reads have their own tests in test_irsa_ranges.py.
    """
    unsupported = irsa_ranges.PartialReadError("disabled in this test")
    with patch.object(irsa_ranges.RangeReader, "read_cutout", side_effect=unsupported), \
            patch.object(irsa_ranges.RangeReader, "read_plane", side_effect=unsupported), \
            patch("app.integrations.http_retry.time.sleep"):
        yield


def test_search_filters_orders_and_keeps_extra_row():
    table = Table({
        "access_url": [SOURCE, SOURCE.replace("dr1", "qr3")],
        "obs_id": ["one", "two"],
        "energy_bandpassname": ["SPHEREx-D2", "SPHEREx-D2"],
        "t_min": [61001.0, 61000.0],
        "t_max": [61001.001, 61000.001],
    })
    with patch("app.integrations.irsa.Irsa") as irsa:
        irsa.return_value.query_sia.return_value = table[::-1]
        images = IrsaClient().search(
            ra_deg=210.80227, dec_deg=54.34895, detector=2, limit=1,
            start_mjd=61000, end_mjd=61002,
        )
        args, kwargs = irsa.return_value.query_sia.call_args
    assert args == ()
    assert kwargs["pos"] == (210.80227, 54.34895, 1 / 3600)
    assert kwargs["TIME"] == "61000 61002"
    assert kwargs["maxrec"] == 10000
    assert set(kwargs["collection"]) == {"spherex_dr1", "spherex_dr1_deep", "spherex_qr3", "spherex_qr3_deep"}
    assert len(images) == 2
    assert images[0].observation_id == "one"
    assert images[0].detector == 2
    assert images[1].collection == "qr3"
    assert images[0].observed_end_mjd == 61001.001


@pytest.mark.parametrize("change", [
    {"ra_deg": float("nan")}, {"ra_deg": 360}, {"dec_deg": -91},
    {"detector": 7}, {"limit": 0}, {"limit": 101},
    {"start_mjd": float("inf")}, {"start_mjd": 2, "end_mjd": 1},
])
def test_invalid_search_never_contacts_archive(change):
    arguments = {"ra_deg": 12.0, "dec_deg": 30.0, "detector": None, "limit": 20}
    with patch("app.integrations.irsa.Irsa") as irsa:
        with pytest.raises(ValueError):
            IrsaClient().search(**(arguments | change))
        irsa.assert_not_called()


@pytest.mark.parametrize("error", [requests.Timeout(), DALServiceError(cause=requests.Timeout())])
def test_search_timeout_mapping(error):
    with patch("app.integrations.irsa.Irsa") as irsa:
        irsa.return_value.query_sia.side_effect = error
        with pytest.raises(ArchiveTimeout):
            IrsaClient().search(ra_deg=12, dec_deg=30, detector=None, limit=20)


@pytest.mark.parametrize("source", [
    "https://example.com/image.fits", SOURCE.replace("https", "http"),
    SOURCE + "?center=1,2", SOURCE.replace("/dr1/", "/qr2/"),
    SOURCE.replace("/week/", "/../"), SOURCE.replace("/week/", "/%2e%2e/"),
    SOURCE.replace("irsa.ipac.caltech.edu", "irsa.ipac.caltech.edu@evil.example"),
])
def test_untrusted_download_url_never_contacts_network(source):
    with patch("app.integrations.irsa.requests.get") as get:
        with pytest.raises(ArchiveError):
            IrsaClient().download_cutout(source, 12, 30, 0.1)
        get.assert_not_called()


def response_for(chunks, status_code=200):
    response = MagicMock()
    response.__enter__.return_value = response
    response.status_code = status_code
    response.iter_content.return_value = chunks
    return response


def test_download_passes_cutout_coordinates_and_preserves_bytes():
    content = b"SIMPLE  =                    T" + b" " * 100
    with patch("app.integrations.irsa.requests.get", return_value=response_for([content])) as get:
        assert IrsaClient().download_cutout(SOURCE, 12, -30, 0.1) == content
    assert get.call_args.args == (SOURCE,)
    options = get.call_args.kwargs
    assert options["params"] == {"center": "12.000000000000,-30.000000000000d", "size": "0.1", "gzip": "false"}
    assert options["allow_redirects"] is False
    assert options["stream"] is True


def test_download_rejects_redirect():
    with patch("app.integrations.irsa.requests.get", return_value=response_for([], 302)):
        with pytest.raises(ArchiveError, match="redirect"):
            IrsaClient().download_cutout(SOURCE, 12, 30, 0.1)


def test_download_enforces_size_limit():
    with patch("app.integrations.irsa.MAX_DOWNLOAD_BYTES", 12):
        with patch("app.integrations.irsa.requests.get", return_value=response_for([b"SIMPLE  =", b"x" * 12])):
            with pytest.raises(ArchiveError, match="download limit"):
                IrsaClient().download_cutout(SOURCE, 12, 30, 0.1)


def test_download_rejects_non_fits_response():
    with patch("app.integrations.irsa.requests.get", return_value=response_for([b"<html>archive error</html>"])):
        with pytest.raises(ArchiveError, match="FITS"):
            IrsaClient().download_cutout(SOURCE, 12, 30, 0.1)


def test_download_timeout_mapping():
    with patch("app.integrations.irsa.requests.get", side_effect=requests.Timeout):
        with pytest.raises(ArchiveTimeout):
            IrsaClient().download_cutout(SOURCE, 12, 30, 0.1)


def test_search_rejects_truncated_archive_results():
    with patch("app.integrations.irsa.Irsa") as irsa:
        irsa.return_value.query_sia.side_effect = DALOverflowWarning("overflow")
        with pytest.raises(SearchTooBroad):
            IrsaClient().search(ra_deg=12, dec_deg=30, detector=None, limit=1)


def test_search_retries_a_briefly_busy_archive():
    table = Table({"access_url": [SOURCE], "obs_id": ["one"], "energy_bandpassname": ["SPHEREx-D2"],
                   "t_min": [61001.0], "t_max": [61001.001]})
    busy = MagicMock(status_code=503, headers={})
    with patch("app.integrations.irsa.Irsa") as irsa:
        irsa.return_value.query_sia.side_effect = [
            DALServiceError(cause=requests.HTTPError(response=busy)),
            DALServiceError(cause=requests.ConnectionError("dropped")),
            table,
        ]
        images = IrsaClient().search(ra_deg=12, dec_deg=30, detector=None, limit=20)
        assert irsa.return_value.query_sia.call_count == 3
    assert [image.observation_id for image in images] == ["one"]


def test_search_gives_up_after_repeated_archive_failures():
    with patch("app.integrations.irsa.Irsa") as irsa:
        irsa.return_value.query_sia.side_effect = DALServiceError(cause=requests.ConnectionError("dropped"))
        with pytest.raises(ArchiveError):
            IrsaClient().search(ra_deg=12, dec_deg=30, detector=None, limit=20)
        assert irsa.return_value.query_sia.call_count == 3


def test_cutout_service_retries_a_busy_response():
    content = b"SIMPLE  =                    T" + b" " * 100
    busy = response_for([], 503)
    busy.headers = {"Retry-After": "2"}
    busy.raise_for_status.side_effect = requests.HTTPError(response=busy)
    with patch("app.integrations.irsa.requests.get", side_effect=[busy, response_for([content])]) as get:
        assert IrsaClient().download_cutout(SOURCE, 12, -30, 0.1) == content
    assert get.call_count == 2
