"""Scientific and catalog regressions for the prototype's local-sky workflow."""
from datetime import datetime, timezone
import struct
import json
from unittest.mock import patch

import astropy.units as u
from astropy.table import Table, MaskedColumn
from astropy.utils import iers
import numpy as np
import pytest
from pydantic import ValidationError

from app.integrations.catalog import parse_hipparcos_catalog
from app.schemas.sky import ClickSearchRequest
from app.services.image_geometry import click_to_icrs
from app.services.sky import calculate_sky
from app.services.sky_transport import encode_sky
from app.services.stars import StarService

OBSERVER = {"latitude_deg": 14., "longitude_deg": -89., "elevation_m": 0}
AT = datetime(2025, 1, 1, tzinfo=timezone.utc)
STAR = {"hipparcos_id": 1, "common_name": "HIP 1", "right_ascension_deg": 90.,
        "declination_deg": 20., "apparent_magnitude": 1., "bv_color_index": None,
        "color_hex": "#ffffff", "pm_ra_cosdec_arcsec_yr": 0., "pm_dec_arcsec_yr": 0.}


def test_hipparcos_native_epoch_coordinates_units_and_missing_data():
    table = Table({"HIP": [1, 2], "RAICRS": [0., 90.],
                   "DEICRS": MaskedColumn([0., 20.], mask=[False, True]),
                   "Vmag": [0., 2.], "B-V": MaskedColumn([0., 0.], mask=[True, False]),
                   "pmRA": [1000., 0.], "pmDE": [-2000., 0.]})
    table["pmRA"].unit = table["pmDE"].unit = u.mas / u.yr
    stars = parse_hipparcos_catalog(table)
    assert len(stars) == 1
    assert stars[0]["right_ascension_deg"] == 0
    assert stars[0]["apparent_magnitude"] == 0
    assert stars[0]["bv_color_index"] is None
    assert stars[0]["pm_ra_cosdec_arcsec_yr"] == pytest.approx(1)
    assert stars[0]["pm_dec_arcsec_yr"] == pytest.approx(-2)


def test_catalog_cache_survives_restart_and_magnitude_selection(tmp_path):
    path = tmp_path / "catalog.json"
    with patch("app.services.stars.fetch_catalog", return_value=[STAR]) as fetch:
        first = StarService(path)
        assert first.selected(0) == []
        assert first.selected(1) == [STAR]
        version = first.metadata()["catalog_version"]
        second = StarService(path)
        assert second.selected(2) == [STAR]
        assert second.metadata()["catalog_version"] == version
        fetch.assert_called_once()


def test_click_recovers_the_star_coordinate_from_its_rendered_direction():
    with iers.conf.set_temp("auto_download", False):
        snapshot = calculate_sky([STAR], OBSERVER, AT, False)
        ra, dec = click_to_icrs(snapshot["directions"][0], OBSERVER, AT)
    assert ra == pytest.approx(STAR["right_ascension_deg"], abs=1e-6)
    assert dec == pytest.approx(STAR["declination_deg"], abs=1e-6)


def test_live_binary_and_json_share_direction_order_and_sample_times():
    with iers.conf.set_temp("auto_download", False):
        data = calculate_sky([STAR], OBSERVER, AT, True, binary=True)
        plain = calculate_sky([STAR], OBSERVER, AT, True)
    payload = encode_sky(data)
    assert payload[:4] == b"SKY1"
    header_length = struct.unpack("<I", payload[4:8])[0]
    header = json.loads(payload[8:8+header_length])
    values = np.frombuffer(payload[8+header_length:], dtype="<f4").reshape(13, 3)
    assert header["sample_times_ms"] == plain["sample_times_ms"]
    assert header_length % 4 == 0
    np.testing.assert_allclose(values, plain["directions"], atol=1e-7)
    assert not np.allclose(values[0], values[-1])


@pytest.mark.parametrize("changes", [
    {"direction": [0, 0, 0]}, {"direction": [0, float("nan"), 0]},
    {"at": "2025-01-01T00:00:00"}, {"size_arcmin": 31},
    {"start_time": "2025-02-01T00:00:00Z", "end_time": "2025-01-01T00:00:00Z"},
])
def test_invalid_click_inputs(changes):
    with pytest.raises(ValidationError):
        ClickSearchRequest(**({"observer": OBSERVER, "at": AT, "direction": [0, 1, 0]} | changes))
