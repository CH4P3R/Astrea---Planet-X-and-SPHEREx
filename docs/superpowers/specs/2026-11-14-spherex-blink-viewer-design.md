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
follow a moving source with zoom or difference mode. Not a polished product, not
a mock.

The repo today: React 19 + Vite + three.js frontend still on the starter screen;
`backend/` has dependencies but no code; `notebooks/01…06` hold the IRSA tutorial
markdown in the intended pipeline order (overview → cutouts → PSF → source
discovery → mosaic cube → HiPS cube). Nothing else to inherit.

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
  §14).
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
  may have only one visit in the current release — verify per target early (§13).
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
(§10) — never as 102 separate blink images.

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
  ├─ Renderer ........... astropy → IMAGE ext → reproject → scale → PNG
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

Only new dependency beyond `backend/requirements.txt`: `reproject` (astropy
affiliated), for the common grid in §10.

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
| `detector` | int | most epochs | 1–6; omitted picks the array with the most epochs, `all` mixes them (warned) |
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
- One detector array by default — the array with the most epochs at this position —
  because arrays differ in bandpass, pixel scale, and PSF. `detector=all` is
  explicit opt-in and returns a warning that frames are not like-for-like.
- `max_frames` keeps a spread across the baseline (first, last, evenly spaced),
  never the earliest N, so a single night's revisit cluster cannot hide motion.
- Rows are filtered to spectral images by `dataproduct_subtype`; other product
  types in a SIA response are dropped before the FITS stage.
- After the response, the server prefetches the remaining frame images with
  `BackgroundTasks`, so the first cold view warms the rest.
- Empty `frames` with a `warnings` entry is a valid answer, not a 500.
- Errors are `{"detail": "..."}` with 4xx for bad input, 502 for upstream failure,
  504 for upstream timeout.
- `cached` tells the frontend and the demo operator whether IRSA was touched.

### `GET /api/frames/{id}/image`

Returns `image/png`. Cold requests are **synchronous**: if the frame is not
cached, the server fetches the cutout, reprojects, renders, caches, and returns,
with a hard timeout (504 on expiry). There is no job queue — the browser's image
request is the job; the frontend shows a per-frame spinner and a retry on failure.

Stretch is a **query-level** value (`scale=linear|log|asinh`,
`percentiles=a,b`): the frontend asks for it once, the backend computes it over
the pixels of all frames in the query, and every frame image uses it. Per-frame
autoscaling would normalize away the brightness change of the two variable stars.

### `GET /api/health`

`{"status": "ok", "cache_entries": N}`.

## 10. Image pipeline

1. **Query.** SIA with `POS=CIRCLE ra dec <fov/2>`, chosen collection(s), JSON
   response. Cache the result for 24 h (ingestion is weekly; SIA lags a day).
2. **Select.** One row per MEF; dedupe by `obs_id`; drop non-image subtypes.
   Detector is only in the header, so derive it from the filename (`_2D3_` → 3)
   as a fast path, then treat the header as truth after download. Default to the
   array with the most epochs at this position.
3. **Cutout.** Fetch at `fetch_size = max(0.2°, fov)` capped at 0.5°, so one
   cached FITS serves every FOV the user can pick (`fov` becomes a client-side
   crop). Download with timeout, 3 retries, exponential backoff.
4. **Reproject.** Resample `IMAGE` onto a common north-up grid: fixed pixel scale
   from config, centered on the query position. Pixels outside the frame
   footprint are masked. Without this step, orientation and pixel-scale
   differences between exposures read as motion.
5. **Render.** Mask pixels whose `FLAGS` bits are in the configured bad set; count
   flags from the `FLAGS` array in the same pass (`L2 N_*` header keywords are a
   cross-check only, not the source of truth); apply the query-level percentile
   stretch; encode 8-bit PNG.
6. **Metadata.** Epoch from `t_min`/`DATE`, detector and `PSF_FWHM` from the
   header, pixel scale after reprojection, footprint coverage.
7. **Stretch features** (only after acceptance passes): per-epoch mean stack of
   detector arrays; add/subtract of frames in the browser canvas; on-the-fly
   spectrum by sampling `WAVE-TAB`.

## 11. Caching and the update path

- Cache root: `backend/data/cache/`.
- SIA query cache: `cache/sia/<sha1>.json`, 24 h TTL, keyed by
  (ra, dec, fov, collections).
- FITS cache: `cache/fits/<sha1>.fits`, keyed by (obs_id, fetch_size); immutable
  because an `obs_id` never changes.
- PNG cache: `cache/png/<sha1>.png`, keyed by (obs_id, grid, stretch); derived
  and disposable.
- Because cutouts are fetched at `fetch_size`, changing FOV never invalidates the
  cache; only a FOV above `fetch_size` triggers a fetch at the new size.
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
- Zoom 1–4× is a local scale/crop of the same preloaded image; only a FOV larger
  than the fetched cutout needs new requests.
- Each frame shows a spinner until its PNG resolves and a retry button on
  failure; no blank frames and no all-or-nothing view.
- Difference mode (default off): subtract the previous or a chosen frame from the
  current one in the canvas, so sub-pixel motion is visible without zoom.
- Stretch is requested once per query and reused for every frame, so the two
  variable stars actually change brightness on screen.
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

1. `/api/frames` returns at least two frames, and the `warm` report prints the
   epoch span per target. A target with a single visit inside a release fails the
   warm run, not the demo — merge `spherex_qr3` before concluding it is missing.
2. With 2–4× zoom or difference mode, the proper-motion targets show a
   displacement. At the same stretch, the variables show a brightness change.
   At native scale and with per-frame autoscaling neither is visible — that is
   why zoom and difference mode are Must and the stretch is query-wide.
3. No 5xx, no blank images, no unlabeled frames; every frame shows its epoch.

Automated:

- `pytest` unit tests: SIA query builder, cutout URL builder, cache key stability,
  response model shape, empty-result handling.
- One recorded SIA JSON fixture → frames response (no network).
- One recorded cutout FITS fixture → PNG with the expected dimensions and non-zero
  variance.
- A reprojection test: two synthetic frames with different WCS/rotation land on
  the same grid shape and center.
- A render test that asserts flag-masked pixels are excluded.
- Frontend: a smoke test that mounts `Blink` with two fake frames and switches
  images.

Manual demo checklist: run `warm`, kill network, walk the five targets, check
labels, check URL restore, check one bad coordinate.

## 14. Milestones (must / should / could)

**Must — the demo:**

1. SIA client + frame table (real data, single detector array by default).
2. Cutout fetch + reprojection to a common grid + FITS → PNG.
3. Query-wide stretch computed once over all frames.
4. Blink UI with epoch labels and 1–4× zoom.
5. Difference mode (subtract two epochs in the canvas).
6. Disk cache + `warm` for the five targets, with a per-target epoch report.
7. URL parameters and FOV control, plus per-frame spinner/retry on the cold path.
8. Acceptance run with network off.

**Should:**

9. All six detector arrays with an explicit selector (`detector=all`).
10. Metadata table and contamination flag summary.
11. Better empty/error states.

**Could:**

12. On-the-fly spectra via `WAVE-TAB`.
13. Gaia/WISE overlays.
14. Per-array stacking for signal-to-noise.
15. Deployment.

## 15. Left to the builder

- Colormap and the exact stretch defaults, tuned on the five targets.
- Whether images are 8-bit PNG or WebP (start PNG; measure on the demo machine).
- Whether the blink preloads all frames or the first three (start all, cap 12).
- Exact cache eviction policy and disk budget (none for the demo; document cost).
- Whether reprojection uses `reproject_interp` or `reproject_exact` (start
  `interp`; cutouts are small).
- Deployment target, if any.

## 16. Risks

| Risk | Mitigation |
| --- | --- |
| A target has <2 epochs in DR1 | Check during warm; fall back to `spherex_qr3`, then to the deep collection; surface the report early |
| IRSA slow/rate-limited during demo | Cache + pre-warm; `cached` flag; offline checklist |
| Cutout size/time too large | Cap FOV at 0.5°, default 0.1°, MAXREC cap, timeouts |
| Detector unknown until download | Filename as a fast path, header as truth |
| Reprojection slow or artifacts at frame edges | `reproject_interp` on small cutouts; mask outside-footprint pixels; fall back to center crop with an orientation warning if measured slow |
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
