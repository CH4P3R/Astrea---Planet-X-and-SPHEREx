"""Settings come from defaults, optionally overridden by ASTREA_* variables."""

from pathlib import Path

import pytest

from app.application import create_app
from app.core.config import DEFAULT_BAD_FLAGS, Settings


def test_no_variables_keep_the_defaults():
    assert Settings.from_env({}) == Settings()
    assert Settings.from_env({"PATH": "/bin", "HOME": "/home/x"}) == Settings()


def test_each_variable_overrides_its_field(tmp_path):
    settings = Settings.from_env({
        "ASTREA_CACHE_DIR": str(tmp_path / "cutouts"),
        "ASTREA_STAR_CACHE": str(tmp_path / "stars.json"),
        "ASTREA_CORS_ORIGINS": " https://astrea.example , http://localhost:5173,",
        "ASTREA_BAD_FLAGS": "hot, cold",
        "ASTREA_ARCHIVE_BUDGET_SECONDS": "45.5",
    })
    assert settings.cutout_cache_dir == tmp_path / "cutouts"
    assert settings.star_cache_path == tmp_path / "stars.json"
    assert settings.cors_origins == ("https://astrea.example", "http://localhost:5173")
    assert settings.bad_flags == ("HOT", "COLD")
    assert settings.archive_budget_seconds == 45.5
    assert Settings().bad_flags == DEFAULT_BAD_FLAGS


@pytest.mark.parametrize("environ,message", [
    ({"ASTREA_ARCHIVE_BUDGET_SECONDS": "soon"}, "is not a number"),
    ({"ASTREA_ARCHIVE_BUDGET_SECONDS": "0"}, "positive"),
    ({"ASTREA_ARCHIVE_BUDGET_SECONDS": "nan"}, "positive"),
    ({"ASTREA_CORS_ORIGINS": " , "}, "at least one"),
    ({"ASTREA_CACHE_DIR": "  "}, "must not be empty"),
    ({"ASTREA_BAD_FLAGS": "HOT,source"}, "SOURCE"),
    ({"ASTREA_CACHE_DIRECTORY": "/tmp/x"}, "Unknown setting"),
])
def test_invalid_values_fail_fast_and_name_the_variable(environ, message):
    with pytest.raises(ValueError, match=message):
        Settings.from_env(environ)


def test_create_app_reads_the_environment(monkeypatch, tmp_path):
    monkeypatch.setenv("ASTREA_CACHE_DIR", str(tmp_path / "env-cutouts"))
    monkeypatch.setenv("ASTREA_ARCHIVE_BUDGET_SECONDS", "30")
    app = create_app()
    assert app.state.image_service.store.root == Path(tmp_path / "env-cutouts")
    assert app.state.image_service.archive.budget_seconds == 30


def test_create_app_refuses_a_bad_environment(monkeypatch):
    monkeypatch.setenv("ASTREA_BAD_FLAGS", "SOURCE")
    with pytest.raises(ValueError, match="SOURCE"):
        create_app()
