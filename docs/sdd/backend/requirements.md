# Astrea backend — Requirements

- **Phase:** Requirements (spec-driven development: **requirements** → design → tasks)
- **Scope:** `backend/` (FastAPI service). Frontend behaviour appears only
  where the backend must support it.
- **Date:** 2026-11-15
- **Sources:**
  - historical product goals G1–G7 (`docs/superpowers/specs/2026-11-14-spherex-blink-viewer-design.md` §2);
  - the active Blink spec (`docs/superpowers/specs/2026-11-14-spherex-backend-fastapi-design.md`), which wins where they conflict;
  - design goals D1–D8 ([`design.md`](design.md) §2);
  - hardening REQ-1 to REQ-7 ([`spec.md`](spec.md)).
- **Status markers:** ✅ met by the current code and tests · 🟡 partly met · ⬜ not yet.

Requirements use EARS phrasing: *ubiquitous* ("The service shall…"),
*event-driven* ("When…"), *unwanted behaviour* ("If…, then…") and
*optional feature* ("Where…"). "The service" is the Astrea backend; "the
client" is any API consumer, normally the frontend.

## 1. Functional requirements

### 1.1 Discovery (SRCH)

| ID | Requirement | Status | Goal |
| --- | --- | --- | --- |
| SRCH-1 | When the client requests a search for an ICRS position and a cutout size, the service shall return the SPHEREx Level 2 observations whose footprint contains that position, each with an opaque ID, observation ID, detector, release, observation start/end (MJD and UTC) and the requested geometry. | ✅ | G1 |
| SRCH-2 | When the client sends a direction clicked on the observer's sky, together with the observer and displayed time, the service shall convert it to ICRS and perform SRCH-1. | ✅ | G1 |
| SRCH-3 | When the client sends the four corner directions of a box dragged on the observer's sky, the service shall compute the box centre and the side of the north-aligned square that covers it, perform SRCH-1 with them, and return that selection with the results. | ✅ | G1, G7 |
| SRCH-4 | If a dragged box needs a cutout larger than 0.5° or smaller than one SPHEREx pixel (6.15″), then the service shall reject it with HTTP 422 stating the selected size and the limit, without contacting IRSA. | ✅ | G7 |
| SRCH-5 | The service shall order search results by observation start, newest first, return at most the requested `limit` (1–100) and report `has_more` when more matches exist. | ✅ | G1 |
| SRCH-6 | Where date bounds are given, the service shall return only observations whose start lies within them (inclusive, timezone required). | ✅ | G1 |
| SRCH-7 | The service shall search every SPHEREx release that IRSA advertises, without a hard-coded list of release names. If the registry is unavailable, then it shall reuse the last known list or search by mission. | ✅ | G1 |
| SRCH-8 | The service shall not download image data during a search. | ✅ | D2 |
| SRCH-9 | If IRSA reports more than 10 000 matches, then the service shall respond 422 asking for narrower dates, never a truncated list presented as complete. | ✅ | D6 |

### 1.2 Image data (DATA)

| ID | Requirement | Status | Goal |
| --- | --- | --- | --- |
| DATA-1 | When the client requests a registered image ID, the service shall download that cutout once, decode its IMAGE plane and return its metadata: dimensions, dtype, byte order, row origin, unit, finite statistics, centre, footprint, celestial WCS cards and provenance. | ✅ | G1 |
| DATA-2 | The service shall return image pixels as contiguous little-endian floats in the source precision (float32 or float64), row 0 at the bottom, preserving negative values, NaN and infinity. | ✅ | D3 |
| DATA-3 | The service shall never apply a display stretch, colour map, downsampling or server-side rendering to pixels. | ✅ | D3; Blink spec §1 |
| DATA-4 | Where the client requests `subtract_zodi`, `mask_flags` or `signal_to_noise`, the service shall return the pixels with those corrections in the same layout. Without options it shall return the untouched IMAGE plane. | ✅ | D1, D3 |
| DATA-5 | The service shall mask quality flags by name, resolved per file, and shall never mask `SOURCE`. | ✅ | D3 |
| DATA-6 | When the client requests the `flags`, `zodi` or `variance` plane, the service shall return it on exactly the image's pixel grid, with the file's flag-bit definitions for `flags`. | ✅ | D3; REQ-1 |
| DATA-7 | If the requested image ID is unknown, then the service shall respond 404 asking for a new search. | ✅ | D6 |
| DATA-8 | The service shall never use the FITS `DATE` card as the observation time. | ✅ | G2 |

### 1.3 Geometry and sky (GEO)

| ID | Requirement | Status | Goal |
| --- | --- | --- | --- |
| GEO-1 | When the client requests the projection of an image for an observer, time and mode, the service shall return a WCS mesh (UVs, triangle indices) and the local directions of its vertices for each time sample, accurate to 0.15 native pixel. | ✅ | G2 |
| GEO-2 | If an image's WCS cannot be meshed to that accuracy, then the service shall respond 422 with a stable message. | ✅ | D6 |
| GEO-3 | The service shall provide Hipparcos stars and their observer-relative directions (JSON or the SKY1 binary format), using the same scene convention and time samples as GEO-1. | ✅ | G2 |
| GEO-4 | If the requested time is outside the available Earth-orientation data, then the service shall respond 422 instead of extrapolating. | ✅ | D6 |

### 1.4 Frontend blink support (BLNK)

Blink selection, playback and display scaling belong to the frontend (active
Blink spec §2). The backend requirements are:

| ID | Requirement | Status | Goal |
| --- | --- | --- | --- |
| BLNK-1 | The service shall serve every observation independently: loading, reading or projecting one observation shall not alter another's cached data or results. | ✅ | G2 |
| BLNK-2 | When several observations are projected with the same observer, time and mode, the service shall return identical time samples, so the client can place them together. | ✅ | G2 |
| BLNK-3 | Once an observation is loaded, the service shall serve its metadata, pixels and projection without further archive downloads. | ✅ | G2, G3 |
| BLNK-4 | The service shall not hold playback state, select comparison partners or compute a shared display scale. | ✅ | Blink spec §2 |
| BLNK-5 | The documented contract shall let the frontend implement A/B blink, and later N-observation playback, from `API.md` alone. | ✅ | G2 |

### 1.5 Offline demo preparation (OFF), optional

Implemented by `GET /api/v1/targets` and `python -m app.warm`; the live
warm run and a browser-side offline search are still pending (tasks 4.4).

| ID | Requirement | Status | Goal |
| --- | --- | --- | --- |
| OFF-1 | The service shall provide the acceptance targets (§3) with coordinates propagated by proper motion to the SPHEREx epoch. | ✅ | G4 |
| OFF-2 | When the operator runs the warm command, the service shall search, load and cache the chosen observations for each target, save a manifest, and report per target the detector, frames, time span, fetched, cached and failed counts. | ✅ | G3, G4 |
| OFF-3 | If a target ends the warm run with fewer than two ready observations or any failure, then the warm command shall exit with status 1. | ✅ | G4, G5 |
| OFF-4 | Where `--offline` is given, the warm command shall verify the manifest's cached data without any network access. | ✅ | G3 |

## 2. Non-functional requirements

| ID | Requirement | Status | Design goal |
| --- | --- | --- | --- |
| NFR-1 Compatibility | New features shall add routes, or optional fields and parameters with defaults; existing response shapes shall not change. | ✅ | D1 |
| NFR-2 Transfer | The service shall download only the planes and rows a request needs (byte ranges), falling back to the cutout service when that is not possible. | ✅ | D2 |
| NFR-3 Resilience | The service shall retry brief archive failures (429/5xx, dropped connections) at most twice, honouring a short `Retry-After`, and never retry timeouts. | ✅ | D4 |
| NFR-4 Time budget | Each image or plane download shall finish or fail within a configurable budget (120 s by default), retries and fallback included; on expiry the service shall respond 504. | ✅ | D4; REQ-2 |
| NFR-5 Caching | Loaded images and planes shall be cached on disk with atomic writes and survive restarts. Concurrent requests for one image shall download it once per worker. | ✅ | D5 |
| NFR-6 Errors | Failures shall map to stable statuses and messages (404, 409, 422, 502, 503, 504); upstream tracebacks shall stay in the logs. Invalid input, including NaN or infinity in a JSON body, shall produce 422, never 500. | ✅ | D6 |
| NFR-7 Outbound safety | Archive URLs shall be restricted to IRSA's SPHEREx Level 2 paths; redirects refused; download size, image size and row counts capped; inputs validated before any network call. | ✅ | D7 |
| NFR-8 Testability | The automated tests shall run without network access. | ✅ | D8 |
| NFR-9 Configuration | Deployment settings (cache paths, CORS origins, masked flags, download budget) shall be configurable by environment variables. Invalid values shall stop startup with a message naming the variable. | ✅ | D1 |
| NFR-10 Observability | Each archive download shall log one line with the image, path (ranges or service), outcome, bytes, duration and retries. | ✅ | D6 |
| NFR-11 Dependencies | The API's dependencies shall have tested lower bounds (`requirements-min.txt`), separate from notebook and ML packages. | ✅ | REQ-7 |
| NFR-12 Scope | The service shall run as a single process without a database or job queue. Multi-worker deployment is out of scope. | ✅ | design §2 |

## 3. Acceptance targets

Candidates from the product proposal. Each still needs **live validation**:
coordinates from SIMBAD, at least two observations in the current releases,
and a visible effect at a shared display scale. Implementing blink does not
guarantee a visible change.

| ID | Target | Expected signal | Status |
| --- | --- | --- | --- |
| AT-1 | Barnard's Star | High proper motion (~10.4″/yr) | ⬜ |
| AT-2 | Epsilon Indi B | Brown-dwarf pair, ~4.7″/yr, near a bright star | ⬜ |
| AT-3 | WISE 0855−0714 | Very fast and faint (~8.1″/yr) | ⬜ |
| AT-4 | RW Aurigae | Variability | ⬜ |
| AT-5 | R Draconis | Variability | ⬜ |

**AT acceptance:** for each target, at least two ready observations with
recorded dates, no 5xx, and a recorded judgement of whether the expected
motion or brightness change is discernible. Playback alone never counts as a
detection.

## 4. Out of scope

- Server-side blink, frame selection, PNG rendering and display scaling (Blink spec §2).
- Common-grid reprojection and difference images (tasks 5.8).
- Spectra, photometry, source detection and catalog cross-matching (tasks 5.2).
- Exposures that touch a box but not its centre (tasks 5.7).
- Accounts, quotas, TLS, multi-worker scaling (tasks 5.4).

## 5. Traceability

| Goal | Requirements |
| --- | --- |
| G1 Query any position for real SPHEREx data | SRCH-1–9, DATA-1 |
| G2 Blink with epoch labels | BLNK-1–5, GEO-1–3, DATA-8 |
| G3 Cache so repeat views don't need IRSA | NFR-5, BLNK-3, OFF-2, OFF-4 |
| G4 Pre-warm the acceptance targets | OFF-1–3 |
| G5 Pass the acceptance set | AT-1–5, OFF-3 |
| G6 Shareable URL parameters | Frontend; the service is stateless per request (SRCH-3 returns the centre and size to share) |
| G7 User-controlled field of view | SRCH-3, SRCH-4 |
