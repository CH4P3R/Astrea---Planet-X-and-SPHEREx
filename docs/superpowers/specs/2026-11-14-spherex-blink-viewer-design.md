# Astrea — SPHEREx blink viewer: design

- **Date:** 2026-11-14
- **Status:** draft for approval
- **Scope:** hackathon deliverable — a credible public demo on real SPHEREx data

## 1. Intent and why

Astrea is a public web tool for NASA's SPHEREx mission. A visitor enters a sky
position, and the tool shows a short "movie" of that patch across SPHEREx
observing epochs, so moving or variable objects stand out. This is the method
volunteers have used for years on WISE and Backyard Worlds; SPHEREx adds 102
near-infrared channels and weekly data.

Success is a **credible demo on real SPHEREx data**: judges type coordinates (or
the five test objects), see real Level 2 spectral-image cutouts blink, and can
follow a moving source. Not a polished product, not a mock.

The repo today: React 19 + Vite + three.js frontend still on the starter screen;
`backend/` has dependencies but no code; `notebooks/01…06` are empty folders that
record the intended pipeline order (overview → cutouts → PSF → source discovery →
mosaic cube → HiPS cube). Nothing else to inherit.

## 2. Goals

1. Query any ICRS position (RA, Dec) and return a table of real SPHEREx frames
   covering it.
2. Blink those frames in the browser with epoch labels, play/pause, speed.
3. Cache fetched data on disk so repeat views and the demo do not depend on IRSA.
4. Pre-warm the five acceptance targets before the demo.
5. Pass the acceptance set: Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae,
   R Draconis.
6. Shareable view via URL parameters (`?ra=&dec=&fov=`).
7. Field of view is user-controlled.

## 3. Non-goals

- Accounts, logins, database, server-side job queue.
- Browsing all 102 bands as separate images (see §6 — they do not exist that way).
- Source detection, catalog cross-matching, photometry.
- Spectra on the fly, mosaics across positions, HiPS all-sky browsing (stretch,
  §12).
- Production hardening: TLS, multi-worker scaling, quotas, CDN.
- Mobile-first layout (it must not break on a phone, nothing more).

## 4. Anti-goals

These count as failure even if the code runs:

- The demo dies because IRSA is slow, rate-limited, or unreachable.
- The frontend parses FITS.
- We download full ~300 MB MEFs per frame and wait on them in the browser.
- Frames are shown without epoch labels, so a shift cannot be attributed to time.
- We claim to show "102 band images" when SPHEREx spectral images are not that.

## 5. Constraints (verified against IRSA)

- **Collections:** `spherex_dr1` and `spherex_dr1_deep` (Data Release 1, Nov 2026),
  `spherex_qr3` and `spherex_qr3_deep` (Quick Release 3). SPHEREx recommends QR3 +
  DR1 as the uniformly processed set.
- **Search:** SIA v2 at `https://irsa.ipac.caltech.edu/SIA`, e.g.
  `?COLLECTION=spherex_dr1&POS=CIRCLE+<ra>+<dec>+<r>&RESPONSEFORMAT=JSON&MAXREC=...`.
  Results carry `access_url`, `obs_id`, `t_min`, `t_max`, `em_min`, `em_max`,
  `s_region`, `dataproduct_subtype`, `target_name`.
- **Files:** Level 2 products are spectral-image MEFs, several hundred MB each:
  extensions `IMAGE` (2040×2040 float32, MJy/sr), `FLAGS` (int bitmask),
  `VARIANCE`, `ZODI`, `EPSF` (441 regions), `WCS-WAVE` (LVF wavelength lookup).
- **Cutouts:** append `?center=<ra>,<dec>&size=<deg>` to an on-prem
  `access_url`; the service preserves all extensions.
- **Ingestion:** weekly; SIA lags ingestion by about a day.
- **Detectors:** six arrays (D1–D6) covering 0.75–5.0 µm; `DETECTOR` is in the
  image header. The LVF means wavelength varies across each array, so a spectral
  image is *not* one band.
- **Coverage:** all-sky over ~6 months; DR1 is the wide survey. A given position
  may have only one visit in the current release — verify per target early (§11).
- **Browser:** no FITS, no multi-hundred-MB downloads, no archive CORS in the
  critical path.

## 6. Data model (the part most likely to be misunderstood)

SPHEREx does not hand you 102 separate images of a patch. One Level 2 file is
**one exposure of one detector array**; within it, wavelength varies along the
array. Repeated exposures place the source at different array positions, which is
how the 102 channels get sampled.

So the unit Astrea blinks is a **frame**:

```
frame = (collection, obs_id, detector_array, center_ra, center_dec, size_deg)
```

The table returned to the frontend is a list of frames ordered by epoch.
"102 bands" reaches the user later as spectra (stretch) or as array stacks
(§9) — never as 102 separate blink images.

## 7. Approaches considered

- **A. Thin live proxy.** FastAPI queries SIA, fetches cutouts, renders PNG, and
  returns a frame table; React blinks images. Simplest frontend; demo latency and
  availability tied to IRSA.
- **B. Browser talks to IRSA.** Frontend parses FITS and renders. No backend, but
  CORS, file size, and writing a FITS/WCS renderer under deadline.
- **C. Pre-baked dataset only.** Script pulls the five targets; app serves static
  frames. Bulletproof demo, but not a tool and "updatable" is unproven.
- **D. Proxy + disk cache (A + pre-warmed C).** Live for any position, instant
  and offline-safe for anything already fetched or pre-warmed.

**Chosen: D.** It keeps A's contract — API returns the table, frontend renders —
and adds caching, which is also what makes the demo and the tests reliable. B and
C are rejected on demo risk and scope respectively.

## 8. Architecture

```
Browser (React + Vite)
  │  GET /api/frames?ra&dec&fov&collection&detector
  │  GET /api/frames/{cache_key}/image        (PNG)
  ▼
FastAPI (backend/app)
  ├─ SIA client ......... IRSA SIA v2 → frame rows
  ├─ Cutout fetcher ..... access_url + center/size → FITS (retry, backoff)
  ├─ Renderer ........... astropy → IMAGE ext → scale → PNG
  ├─ Cache .............. backend/data/cache/…
  └─ Warm command ....... python -m app.warm targets.yaml
```

Backend modules:

- `app/main.py` — FastAPI app, routes, error handling.
- `app/sia.py` — query builder + response parsing (JSON), TTL cache for query
  results.
- `app/cutout.py` — cutout URL construction, download with retries, FITS open.
- `app/render.py` — image extraction, flag masking, scaling, PNG encode.
- `app/cache.py` — key derivation, atomic writes, lookup.
- `app/warm.py` — CLI that resolves targets and populates the cache.
- `app/models.py` — Pydantic request/response models.
- `app/config.py` — settings via env vars, defaults for cache dir and collections.
- `targets.yaml` — the five acceptance targets.

Frontend:

- `src/App.jsx` — layout and state from URL params.
- `src/api.js` — fetch wrapper for `/api/frames`.
- `src/components/Blink.jsx` — preloads frames, plays/pauses, epoch label.
- `src/components/Controls.jsx` — RA/Dec/FOV, collection, detector, speed.
- `src/components/FrameTable.jsx` — the metadata table under the viewer.
- `src/components/MetaPanel.jsx` — per-frame metadata, flag counts.

## 9. API contract

### `GET /api/frames`

Query parameters:

| Name | Type | Default | Notes |
| --- | --- | --- | --- |
| `ra` | float, deg | required | 0–360 |
| `dec` | float, deg | required | −90–90 |
| `fov` | float, deg | 0.1 | 0.02–0.5; larger costs more |
| `collection` | string | `spherex_dr1` | also `spherex_dr1_deep`, `spherex_qr3` |
| `detector` | int | all | 1–6, optional filter |
| `max_frames` | int | 12 | hard cap to protect the demo |

Response:

```json
{
  "query": {"ra": 133.79513, "dec": -7.24515, "fov": 0.1, "collection": "spherex_dr1"},
  "frames": [
    {
      "id": "sha1:…",
      "obs_id": "2025W18_1B_0074_2",
      "detector": 2,
      "epoch": "2026-07-16T03:19:15Z",
      "mjd": 61247.13837,
      "band_min_um": 1.10,
      "band_max_um": 1.62,
      "pixel_scale_arcsec": 6.15,
      "image_url": "/api/frames/sha1:…/image",
      "flags_summary": {"source_pixels": 4135535, "transient_pixels": 31044},
      "cached": true
    }
  ],
  "warnings": []
}
```

Rules:

- Ordered by `epoch`.
- Empty `frames` with a `warnings` entry is a valid answer, not a 500.
- Errors are `{"detail": "..."}` with 4xx for bad input, 502 for upstream failure,
  504 for upstream timeout.
- `cached` tells the frontend and the demo operator whether IRSA was touched.

### `GET /api/frames/{id}/image`

Returns `image/png` at the requested stretch (query `scale=linear|log|asinh`,
`percentiles=0.5,99.5`). Never blocks on a fresh download it cannot finish within
the configured timeout; returns 504 instead.

### `GET /api/health`

`{"status": "ok", "cache_entries": N}`.

## 10. Image pipeline

1. **Query.** SIA with `POS=CIRCLE ra dec <fov/2>`, chosen collection(s), JSON
   response. Cache the result for 24 h (ingestion is weekly; SIA lags a day).
2. **Select.** One row per MEF; dedupe by `obs_id`. Detector is known from the
   header only, so either filter after download or pre-filter by filename
   convention (`_2D3_` → detector 3); use the header as truth.
3. **Cutout.** Build `access_url + "?center=ra,dec&size=<fov>"`; download with
   timeout, 3 retries, exponential backoff.
4. **Render.** Open FITS, read `IMAGE`; mask pixels whose `FLAGS` bits are in a
   configurable "bad" set; percentile scale per frame (`asinh` default); encode
   PNG (8-bit). Keep the raw FITS in cache; render lazily and cache the PNG.
5. **Metadata.** Take epoch from `t_min`/`DATE`, detector and `PSF_FWHM` from the
   header, flag counts from `L2 N_*` keywords.
6. **Stretch features** (only after acceptance passes): per-epoch mean stack of
   detector arrays; add/subtract of frames in the browser canvas; on-the-fly
   spectrum by sampling `WAVE-TAB`.

## 11. Caching and the update path

- Cache root: `backend/data/cache/`.
- SIA query cache: `cache/sia/<sha1>.json`, 24 h TTL, stores the raw response.
- FITS cache: `cache/fits/<sha1>.fits`, immutable (an `obs_id` never changes).
- PNG cache: `cache/png/<sha1>-<scale>.png`, derived and disposable.
- Atomic writes (temp file + rename) so an interrupted warm run never leaves a
  half file.
- Update path for future releases: collections are configuration, not code;
  adding `spherex_dr2` is one config entry plus a re-warm. No schema migration.

Warm command:

```bash
python -m app.warm targets.yaml --fov 0.1
```

It resolves each target, runs the pipeline, and prints a per-target report of
epochs found. A target with fewer than two epochs is a **hard failure to surface**
before the demo, not something to discover live.

## 12. Frontend behavior

- Reads `ra`, `dec`, `fov`, `collection`, `detector`, `speed` from the URL; writes
  changes back with `replaceState` so a view is shareable/embeddable.
- On load: fetch the table, preload all images, enable play.
- Blink: fixed-size canvas; frame `i` for ~400 ms (configurable 200–2000 ms),
  epoch label + frame counter always visible.
- If only one frame: show it and say "one epoch available; try a larger FOV or
  another collection."
- Table under the viewer: epoch, detector, band range, pixel scale, cached flag.
- Errors render as a plain message with the failing upstream and a retry button.
- Empty state lists the valid collections and the acceptance targets as one-click
  examples.

## 13. Acceptance tests

Coordinates to verify with Sesame/SIMBAD before hard-coding (values below are
approximate):

| Target | RA (deg) | Dec (deg) | Expected signal |
| --- | --- | --- | --- |
| Barnard's Star | 269.452 | +4.693 | high proper motion (~10″/yr) |
| Epsilon Indi B | 330.840 | −56.786 | brown dwarf pair near a bright star |
| WISE 0855 | 133.7951 | −7.2451 | very fast, faint |
| RW Aurigae | 76.956 | +30.401 | variability |
| R Draconis | 248.168 | +66.755 | variability |

Passing the demo means, for each target, with a warm cache and the network off:

1. `/api/frames` returns at least two frames.
2. The blink shows the expected behavior (position shift or brightness change)
   with readable epoch labels.
3. No 5xx, no blank images, no unlabeled frames.

Automated:

- `pytest` unit tests: SIA query builder, cutout URL builder, cache key stability,
  response model shape, empty-result handling.
- One recorded SIA JSON fixture → frames response (no network).
- One recorded cutout FITS fixture → PNG with the expected dimensions and non-zero
  variance.
- A render test that asserts flag-masked pixels are excluded.
- Frontend: a smoke test that mounts `Blink` with two fake frames and switches
  images.

Manual demo checklist: run `warm`, kill network, walk the five targets, check
labels, check URL restore, check one bad coordinate.

## 14. Milestones (must / should / could)

**Must — the demo:**

1. SIA client + frame table (real data, one detector).
2. Cutout fetch + FITS → PNG.
3. Blink UI with epoch labels.
4. Disk cache + `warm` for the five targets.
5. URL parameters and FOV control.
6. Acceptance run with network off.

**Should:**

7. All six detector arrays with a selector; header-derived detector filtering.
8. Difference mode (subtract two epochs in the canvas).
9. Metadata table and contamination flag summary.
10. Better empty/error states.

**Could:**

11. On-the-fly spectra via `WAVE-TAB`.
12. Gaia/WISE overlays.
13. Per-array stacking for signal-to-noise.
14. Deployment.

## 15. Left to the builder

- Exact flag bitmask to treat as "bad" for display (start with `NONFUNC`,
  `MISSING_DATA`, `OVERFLOW`, `SUR_ERROR`; make it config).
- Colormap and stretch defaults, tuned on the five targets.
- Whether images are 8-bit PNG or WebP (start PNG; measure on the demo machine).
- Whether the blink preloads all frames or the first three (start all, cap 12).
- Exact cache eviction policy (none for the demo; document the disk cost).
- How detector filtering is done before download (filename heuristic vs. download
  then read header) — choose by measuring one SIA response.
- Deployment target, if any.

## 16. Risks

| Risk | Mitigation |
| --- | --- |
| A target has <2 epochs in DR1 | Check during warm; fall back to `spherex_qr3`, then to the deep collection; surface the report early |
| IRSA slow/rate-limited during demo | Cache + pre-warm; `cached` flag; offline checklist |
| Cutout size/time too large | Cap FOV at 0.5°, default 0.1°, MAXREC cap, timeouts |
| Detector not filterable before download | Download-then-read-header for v1; optimize only if measured slow |
| Filename-based detector guess wrong | Treat the header as truth, never the filename |
| LVF wavelength misunderstood in UI | Never label frames by band number; show header-derived ranges |
| Weekly ingestion changes row counts | 24 h query TTL; never persist SIA results as fixtures without a date |

## 17. References

- IRSA SPHEREx mission page: <https://irsa.ipac.caltech.edu/Missions/spherex.html>
- DR1 overview: <https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html>
- Cutout service: <https://irsa.ipac.caltech.edu/data/SPHEREx/docs/cutout_tool.html>
- SIA v2 interface: <https://irsa.ipac.caltech.edu/ibe/sia.html>
- Notebooks: intro, cutouts, PSF, source discovery, mosaic, HiPS
  (<https://caltech-ipac.github.io/irsa-tutorials/>)
- Explanatory Supplement: <https://irsa.ipac.caltech.edu/data/SPHEREx/docs/SPHEREx_Expsupp.pdf>
- WiseView (prior art): <https://viewer.wise2.ipac.caltech.edu/>
- Gaia DR3: <https://gea.esac.esa.int/archive/>
