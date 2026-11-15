# Astrea — Blink feature (backend): design

- **Date:** 2026-11-14
- **Status:** draft, **future step** (roadmap step 4 in the backend technical
  documentation). Not implemented.
- **Parent:** [`2026-11-14-spherex-blink-viewer-design.md`](2026-11-14-spherex-blink-viewer-design.md)
- **Builds on:** the existing backend described in
  [`2026-11-14-astrea-backend-technical-documentation.md`](2026-11-14-astrea-backend-technical-documentation.md)
  (branch `Charly`, commit `ef4f862`)
- **Prerequisites:** roadmap step 1 (download retries) and step 3 (quality and
  background processing). This feature reuses both.

## 1. Summary

Blink shows the same sky patch at several epochs so that moving or variable
objects stand out. The current `/api/v1/images` API was designed for viewing
one image at a time: newest first, all detectors, raw pixels in each
exposure's own orientation. Blink needs four things that API does not give:

1. **One detector array** for every frame, because arrays differ in bandpass,
   pixel scale and PSF.
2. **Frames spread across the time baseline**, not the newest N, which tend
   to cluster in a few nights.
3. **A common pixel grid**: every frame reprojected north-up, at the same
   scale, centred on the target. Otherwise rotation reads as motion.
4. **Comparable values**: `IMAGE − ZODI` and bad pixels masked. Otherwise
   background changes and hot pixels flicker.

The feature is a **new module** that follows the existing pattern
(schema → service → routes) and reuses `IrsaClient`, `CutoutStore` and
`decode_cutout`. It returns **float32 grids**, like `/pixels`. The frontend
applies one shared stretch and does all drawing. Existing endpoints and
`API.md` stay unchanged.

## 2. What changes compared with the parent spec

The parent spec predates the backend code. This design replaces the following
parts of it:

| Parent spec | This design | Why |
| --- | --- | --- |
| `/api/frames`, `/api/frames/{id}/image` (PNG) | `/api/v1/blink`, `/api/v1/blink/frames/{id}/pixels` (float32) | The codebase uses `/api/v1`. The team chose to render in the frontend (raw floats, as in `API.md`). |
| Backend computes the stretch | Backend returns `suggested_stretch`; the frontend applies it to all frames | Rendering belongs to the frontend. One shared suggestion keeps frames comparable. |
| New modules `sia.py`, `cutout.py`, `cache.py` | Reuse `integrations/irsa.py` and `integrations/cutout_store.py` | They already exist and are tested. |
| Dedupe by `obs_id` | Dedupe by archive URL (already done in `IrsaClient`) | One `obs_id` covers all six arrays (*verified*) |
| Detector from filename | Detector from SIA `energy_bandpassname` (already done) | *Verified* |
| Epoch from `t_min`/`DATE` | `t_min` / header `MJD-AVG`; never `DATE` | `DATE` is the processing date (*verified*) |
| Mask "bad flag bits" | Mask by flag **name**, never `SOURCE` | Bit 21 `SOURCE` marks known stars (*verified*) |
| Fixed acceptance coordinates | Propagate proper motion to the SPHEREx epoch | Barnard's Star moves ~4.4′ between 2000 and 2025.6 |

## 3. Module layout

Additions only. Existing files are touched solely for wiring.

```text
backend/app/
  schemas/blink.py              BlinkQuery, BlinkFrame, BlinkResponse, SuggestedStretch
  services/blink.py             BlinkService: orchestration
  services/frame_selection.py   pure: choose detector, spread over time
  services/reprojection.py      pure: target WCS, reproject_interp, footprint
  services/quality.py           pure: FLAGS name → mask, zodi subtraction (roadmap step 3)
  api/v1/endpoints/blink.py     routes
  warm.py                       CLI: python -m app.warm targets.yaml (roadmap step 5)
backend/targets.yaml
backend/tests/test_frame_selection.py, test_reprojection.py, test_quality.py, test_blink_api.py

wiring:
  application.py      app.state.blink_service = BlinkService(archive, store, settings)
  api/dependencies.py get_blink_service
  api/v1/router.py    include blink router
  api/errors.py       no new exceptions expected (reuses Archive*/Cache*/Unknown*)
  core/config.py      blink_cache_dir, blink_grid_arcsec, blink_bad_flags, …
```

### 3.1 Changes needed in existing integrations

- `IrsaClient.search` caps results at `limit ≤ 100` and returns them newest
  first. Blink needs **every** row for the position, to choose a detector and
  spread frames over time. Add a method
  `IrsaClient.search_all(ra_deg, dec_deg, detector=None) -> list[ArchiveImage]`.
  It shares the current query code, returns all rows (up to `MAX_SEARCH_ROWS`),
  and adds no limit.
- `ArchiveImage` gains `band_min_um` / `band_max_um` (SIA `em_min`/`em_max` × 1e6).
  Both get default values, so existing callers keep working.
- `decode_cutout` reads only `IMAGE`. Add `decode_cutout_planes(content)`,
  which also returns `FLAGS` (with its `MSKN*` names) and `ZODI`. This belongs
  to roadmap step 3 and is shared with blink.

## 4. API

### 4.1 `GET /api/v1/blink`

| Param | Type | Default | Validation |
| --- | --- | --- | --- |
| `ra_deg` | float | required | `0 ≤ ra < 360` |
| `dec_deg` | float | required | `−90 ≤ dec ≤ 90` |
| `fov_deg` | float | `0.1` | `0.02 ≤ fov ≤ 0.5` |
| `detector` | int 1–6 | array with the most frames | |
| `max_frames` | int | `12` | `2 ≤ n ≤ 24` |
| `start_time`, `end_time` | ISO 8601 with tz | none | Same rules as `/images` |

Models use `ConfigDict(extra="forbid", allow_inf_nan=False)`, like
`ImageSearchQuery`.

Response `BlinkResponse`:

```json
{
  "query": {"ra_deg": 133.7928, "dec_deg": -7.2395, "fov_deg": 0.1, "detector": 6,
            "max_frames": 12, "fetch_size_deg": 0.2},
  "detectors": {"1": 36, "2": 48, "3": 45, "4": 36, "5": 48, "6": 45},
  "total_matches": 258,
  "grid": {"width": 118, "height": 118, "pixel_scale_arcsec": 6.15,
           "center": {"ra_deg": 133.7928, "dec_deg": -7.2395, "frame": "ICRS"},
           "orientation": "north-up-east-left", "pixel_origin": "lower-left",
           "dtype": "float32", "byte_order": "little", "unit": "MJy/sr"},
  "processing": {"zodi_subtracted": true,
                 "masked_flags": ["OVERFLOW", "SUR_ERROR", "NONFUNC", "MISSING_DATA", "HOT", "COLD", "TRANSIENT", "PERSIST"]},
  "suggested_stretch": null,
  "frames": [
    {"id": "<64 hex>", "image_id": "<64 hex of the /images cutout>",
     "observation_id": "2025W19_1B_0116_1", "detector": 6, "collection": "dr1",
     "observation": {"start_mjd": 60800.70003, "end_mjd": 60800.70136,
                     "start_utc": "2025-05-05T16:48:02.459Z", "end_utc": "..."},
     "band_min_um": 4.4115, "band_max_um": 5.0096,
     "pixels_url": "/api/v1/blink/frames/<id>/pixels",
     "ready": false}
  ],
  "warnings": []
}
```

Rules:

- Frames are sorted by observation start, **ascending**. This differs from
  `/images`, which sorts descending, because blink plays forward in time.
- The response does not download anything. Frames whose grid is not cached
  have `ready: false`. The frontend requests each `pixels_url` (cold requests
  are synchronous, §4.2).
- `suggested_stretch` is `{"vmin", "vmax", "percentiles": [1, 99.5],
  "reference_id"}` once the **reference frame** (closest to the median epoch)
  is cached, and `null` before that. It is computed on the reference grid,
  within the central `fov_deg` box. The frontend applies one stretch to
  **every** frame and never autoscales per frame. Otherwise variable stars
  would look constant.
- Empty result: 200 with `frames: []` and a warning. One frame: 200 with the
  warning `"one epoch available"`.
- After the response, uncached frames are prefetched with FastAPI
  `BackgroundTasks`: at most 3 at a time, best effort.

### 4.2 `GET /api/v1/blink/frames/{id}/pixels`

- Returns `application/octet-stream`: `width × height` little-endian float32,
  row 0 = south edge (lower-left origin, as in `/images/{id}/pixels`).
- NaN means no data: masked flag, outside the exposure footprint, or
  non-finite in the source.
- Header `X-Astrea-Coverage: 0.97` gives the fraction of the grid with data.
- Cold path: fetch the cutout at `fetch_size_deg` (via `CutoutStore`/
  `IrsaClient`), decode the planes, subtract zodi, mask, reproject, then save.
  A hard budget of 45 s applies → 504.
- Unknown ID → 404, using the same message style as `/images`.

### 4.3 `GET /api/v1/blink/frames/{id}`

JSON for one frame: the `BlinkFrame` fields plus header data once cached:
`psf_fwhm_arcsec`, `processing_version`, `coverage`, `flags_summary`
(counts per flag name in the native cutout). The frontend fetches this lazily
for its metadata panel.

## 5. Pipeline (`services/blink.py`)

1. **Search:** `IrsaClient.search_all(ra, dec, detector=None)`, keeping the
   1″ cone. The SIA result depends only on the position, so it can be cached
   (24 h) under `blink_cache_dir/sia/`.
2. **Select** (`frame_selection.py`, pure):
   - Count frames per detector.
   - With no `detector`, take the array with the most frames. **Ties go to
     the higher-numbered array**, which is redder and suits brown dwarfs.
   - Subsample to `max_frames`: build that many evenly spaced target times
     from the first to the last MJD, then take the nearest unused frame for
     each.
3. **Frame ID:** `sha256({"format_version": 1, "source_url", "center", "fetch_size_deg",
   "grid_arcsec", "bad_flags", "zodi"})`, following the `/images` convention.
   The cutout ID `image_id` is the existing `/images` ID for
   `(source_url, center, fetch_size_deg)`, so both features share one
   downloaded cutout.
4. **Fetch size:** `fetch_size_deg = clamp(fov_deg, 0.2, 0.5)`. One cached grid
   then serves every smaller FOV; the frontend crops.
5. **Quality** (`quality.py`): `data = IMAGE − ZODI`. Build the bad mask from
   `FLAGS` using the file's `MSKNnnnn` names. A configured name that the file
   lacks is skipped and logged once. If `SOURCE` appears in the configuration,
   the app refuses to start. Set masked pixels to NaN.
6. **Reproject** (`reprojection.py`): build a target TAN WCS centred on
   `(ra, dec)` with `CDELT = (−s, +s)`, `s = 6.15″`, and
   `n = ceil(fetch_size·3600 / 6.15)` (0.2° → 118). Resample with
   `reproject.reproject_interp(order="bilinear")`. Pixels where the footprint
   is 0 become NaN.
7. **Save** the grid as raw float32 plus a metadata JSON, using the
   `CutoutStore` pattern: write pixels first, metadata last as the completion
   marker, atomic replace.

## 6. Cache

```text
backend/data/blink/
  sia/<sha256(ra4|dec4|collections)>.json   TTL 24 h; serve stale with a warning if IRSA is down
  frames/<id>.selection.json                written by /blink (registration, like /images)
  frames/<id>.pixels.bin                    reprojected float32
  frames/<id>.metadata.json                 completion marker + header data
```

Raw cutouts are not stored twice. Blink goes through the existing
`image-cutouts/` entry for `image_id`. That store does not persist the FITS,
so roadmap step 3 must decide whether `FLAGS`/`ZODI` are cached as extra
planes next to `pixels.bin`. **Recommended:** add `{id}.flags.bin` and
`{id}.zodi.bin` to `CutoutStore`.

Locks: reuse the `ImageService` lock-pool pattern keyed by frame ID, so a
browser request and a prefetch hit IRSA once. Add `backend/data/blink/` to
`.gitignore`.

## 7. Dependencies

| Package | Why |
| --- | --- |
| `reproject>=0.13` | Common-grid resampling |
| `pyyaml` | `targets.yaml` for the warm command |

`httpx` is already present.

## 8. Targets and warm (roadmap step 5, used by blink)

`backend/targets.yaml`. Values are approximate and **must be checked against
SIMBAD**:

```yaml
epoch: 2025.6
fov_deg: 0.1
targets:
  - {name: "Barnard's Star", ra: 269.452075, dec: 4.693391, pmra: -801.551, pmdec: 10362.394, expected: motion}
  - {name: "Epsilon Indi B", ra: 330.840, dec: -56.786, pmra: 3982, pmdec: -2470, expected: motion}
  - {name: "WISE 0855-0714", ra: 133.795129, dec: -7.245147, pmra: -8118, pmdec: 680, expected: motion}
  - {name: "RW Aurigae", ra: 76.956, dec: 30.401, expected: variability}
  - {name: "R Draconis", ra: 248.168, dec: 66.755, expected: variability}
```

`python -m app.warm targets.yaml [--only NAME] [--offline]` propagates proper
motion with `SkyCoord.apply_space_motion` (angles only), runs
`BlinkService.query` + every frame's pixels, and prints a line per target:

```
WISE 0855-0714  ra=133.79283 dec=-7.23954  D6  12/45 frames  span 370.4 d  fetched 12  cached 0  failed 0
```

The exit code is 1 if any target has fewer than 2 ready frames. `--offline`
makes the archive client raise on any network use, which proves the cache
alone can serve the demo. A `GET /api/v1/blink/targets` route returns the
propagated coordinates, so the frontend's examples and the warm command use
the same values.

## 9. Testing

Same style as `test_images_api.py`: `create_app(Settings(tmp dirs))`, with a
fake archive swapped on `app.state`, and no network.

| Test | Checks |
| --- | --- |
| `test_frame_selection.py` | Detector with most frames; tie → higher; time spread keeps first and last and is never "newest N"; fewer candidates than `max_frames` |
| `test_quality.py` | Bits by name → NaN; `SOURCE` rejected; missing names skipped; zodi subtracted |
| `test_reprojection.py` | Two synthetic frames, one rotated 30° and one at 5.8″/px, put a point source at the same grid pixel ±0.5; outside footprint → NaN; grid 118×118 at 0.2° |
| `test_blink_api.py` | Ascending order; no download in `/blink`; pixels round-trip `118·118·4` bytes; `suggested_stretch` null before the reference frame is cached and set after; 404 unknown; 502/504 mapping; empty and one-frame warnings; shared stretch: a 2× brighter source in frame B gives larger values than in frame A |
| `test_warm.py` | Barnard's Star moves ~4.4′ by 2025.6; exit code 1 with one frame; `--offline` raises on network use |

Fixtures: a dated SIA VOTable for WISE 0855 and one real cutout, with `EPSF`
and `WCS-WAVE` stripped to stay small.

## 10. Frontend contract (summary)

- Call `/api/v1/blink`, then fetch every `pixels_url` in parallel. Show a
  spinner per frame and a retry button on failure.
- Re-poll `/api/v1/blink` (cheap once cached) until `suggested_stretch` is
  present, or compute one from the first decoded frame. Use it for **all**
  frames.
- Crop to `fov_deg` and zoom 1–4× on the client. A difference mode subtracts
  two float grids before stretching. That is only possible because the
  backend sends floats.
- Always show the epoch label (`observation.start_utc`) and the frame counter.

## 11. Build order

1. `search_all` + `frame_selection` + `/blink` returning frames (no pixels).
2. Roadmap step 3: `decode_cutout_planes`, `quality.py`, extra planes in
   `CutoutStore`.
3. `reprojection.py` + `/blink/frames/{id}/pixels`.
4. `suggested_stretch` + prefetch.
5. `targets.yaml`, `warm`, `--offline` acceptance run (parent spec §13).

## 12. Open questions

- **Detector tie-break for the variable stars.** RW Aur and R Dra may look
  better in D1–D3. A per-target `detector` in `targets.yaml` may be the answer.
- **TRANSIENT/PERSIST in the default mask.** Confirm on the five targets that
  they never cover the target itself.
- **QR3 coverage.** QR3 rows start at week `2026W30`. Check per target whether
  QR3 adds epochs beyond DR1.
- **Where FLAGS/ZODI are cached** (§6). Decided in roadmap step 3.
