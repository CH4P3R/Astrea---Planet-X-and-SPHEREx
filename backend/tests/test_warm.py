"""The warm command: choose, load and record observations; verify them offline."""

import io
import json

import pytest

from app import warm
from app.integrations.irsa import ArchiveError, ArchiveImage
from test_images_api import SOURCE, FakeArchive

TARGETS = """epoch: 2025.9
size_deg: 0.1
targets:
  - name: Mover
    simbad_id: "* mover"
    ra_deg: 210.80227
    dec_deg: 54.34895
    expected: motion
"""


class WarmArchive(FakeArchive):
    """Five D2 observations over 100 days and three D3 ones."""

    def __init__(self, detectors=(2, 2, 2, 2, 2, 3, 3, 3)):
        super().__init__()
        self.rows = [ArchiveImage(source_url=SOURCE.replace("x.fits", f"{i}.fits"), observation_id=f"obs-{i}",
                                  detector=detector, collection="dr1", observed_start_mjd=61000.0 + 25 * i,
                                  observed_end_mjd=61000.0 + 25 * i + 0.001)
                     for i, detector in enumerate(detectors)][::-1]


@pytest.fixture
def setup(tmp_path, monkeypatch):
    targets = tmp_path / "targets.yaml"
    targets.write_text(TARGETS)
    monkeypatch.setenv("ASTREA_CACHE_DIR", str(tmp_path / "cutouts"))
    archive = WarmArchive()
    monkeypatch.setattr(warm, "IrsaClient", lambda **kwargs: archive)
    return targets, tmp_path / "manifest.json", archive


def run(*argv):
    out = io.StringIO()
    code = warm.main([str(arg) for arg in argv], out=out)
    return code, out.getvalue()


def test_online_run_loads_a_time_spread_and_writes_a_manifest(setup):
    targets, manifest, archive = setup
    code, output = run(targets, "--max-frames", 3, "--manifest", manifest)
    assert code == 0, output
    assert "OK   Mover            D2  3/5 ready  span   100.0 d  fetched 3  cached 0  failed 0" in output
    assert "1/1 targets ready" in output
    record = json.loads(manifest.read_text())["targets"][0]
    assert record["detector"] == 2 and record["has_more"] is False
    assert [o["start_mjd"] for o in record["observations"]] == [61000.0, 61050.0, 61100.0]
    assert len(archive.downloads) == 3

    code, output = run(targets, "--max-frames", 3, "--manifest", manifest)
    assert code == 0 and "fetched 0  cached 3" in output
    assert len(archive.downloads) == 3


def test_offline_verifies_the_cache_without_network(setup, monkeypatch):
    targets, manifest, _ = setup
    assert run(targets, "--max-frames", 3, "--manifest", manifest)[0] == 0
    monkeypatch.setattr(warm, "IrsaClient", lambda **kwargs: pytest.fail("network client created offline"))
    code, output = run("--offline", "--manifest", manifest)
    assert code == 0, output
    assert "3/3 ready" in output and "fetched 0  cached 3" in output


def test_offline_reports_missing_cache_entries(setup, tmp_path, monkeypatch):
    targets, manifest, _ = setup
    assert run(targets, "--max-frames", 3, "--manifest", manifest)[0] == 0
    monkeypatch.setenv("ASTREA_CACHE_DIR", str(tmp_path / "empty-cache"))
    code, output = run("--offline", "--manifest", manifest)
    assert code == 1
    assert "FAIL Mover" in output and "0/3 ready" in output and "failed 3" in output


def test_offline_archive_refuses_every_call():
    with pytest.raises(ArchiveError, match="Offline mode"):
        warm.OfflineArchive().download_cutout(source_url=SOURCE)


def test_target_with_one_observation_fails_the_run(setup, monkeypatch):
    targets, manifest, _ = setup
    monkeypatch.setattr(warm, "IrsaClient", lambda **kwargs: WarmArchive(detectors=(3,)))
    code, output = run(targets, "--manifest", manifest)
    assert code == 1
    assert "FAIL Mover            D3  1/1 ready" in output
    assert "not ready: Mover" in output


def test_search_failure_is_reported(setup, monkeypatch):
    targets, manifest, archive = setup
    archive.search_error = ArchiveError("IRSA search is temporarily unavailable.")
    code, output = run(targets, "--manifest", manifest)
    assert code == 1
    assert "error: search failed: IRSA search is temporarily unavailable." in output


@pytest.mark.parametrize("argv", [["--max-frames", "1"], ["--fov", "0.7"], ["--only", "Nobody"]])
def test_bad_arguments_stop_with_a_usage_error(setup, argv):
    targets, manifest, _ = setup
    with pytest.raises(SystemExit) as stopped:
        run(targets, "--manifest", manifest, *argv)
    assert stopped.value.code == 2


def test_selection_helpers():
    images = [type("I", (), {"detector": d, "observation": type("O", (), {"start_mjd": t})()})()
              for d, t in [(2, 0.0), (3, 1.0), (3, 2.0), (2, 3.0), (5, 4.0)]]
    assert warm.choose_detector(images, None) == 3
    assert warm.choose_detector(images, 5) == 5
    assert warm.choose_detector([], None) is None
    times = [image.observation.start_mjd for image in warm.spread(images, 3)]
    assert times == [0.0, 2.0, 4.0]
