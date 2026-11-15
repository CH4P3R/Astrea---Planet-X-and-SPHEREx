# Spec: backend hardening after `5b74092`

- **Type:** single-file spec (requirements → design → tasks)
- **Scope:** `backend/` on branch `KC-Rama`
- **Baseline:** commit `5b74092`, 117 passing tests
- **Source:** review findings R1–R7 in [`design.md`](design.md) §15
- **Rule:** no breaking change to existing HTTP contracts. Every change ships
  with tests.

## 1. Requirements

Written as EARS statements. "The service" is the Astrea backend.

### REQ-1 Plane alignment (R1)

1. **1.1** When a plane (`flags`, `zodi`, `variance`) is requested for a
   loaded image, the service shall return values on exactly the image's pixel
   grid: same width, height and origin.
2. **1.2** When the plane cannot be read by byte ranges, the service shall
   use the cutout service and align its plane to the image's grid. It shall
   not fail because the two grids differ along an edge.
3. **1.3** Where part of the image's grid lies outside the service plane, the
   service shall fill those samples with NaN (`zodi`, `variance`), or with the
   file's `MISSING_DATA` bit (`flags`, or 0 if the file defines no such bit).
4. **1.4** If a range-read plane has the same size as the image but a
   different origin, the service shall not return it as aligned.

### REQ-2 Time budget (R2)

1. **2.1** The service shall bound each archive download operation (an image
   or one plane) by a single configurable budget, default 120 s. This covers
   every ranged request, retry wait and fallback.
2. **2.2** When the budget runs out, the service shall stop and respond 504.
3. **2.3** The service shall not start a retry wait that would end after the
   budget.

### REQ-3 Layering (R3)

1. **3.1** `core/` shall not import from `services/`, `integrations/` or
   `api/`.
2. **3.2** The default list of masked flags shall live in `core/config.py`.

### REQ-4 Injectable archive I/O state (R4)

1. **4.1** The byte-range reader's HTTP session and layout registry shall
   belong to an instance created by `IrsaClient`, not to module globals.
2. **4.2** Two applications built by `create_app` shall not share range-reader
   state.

### REQ-5 Projection errors (R5)

1. **5.1** When an image's WCS cannot be meshed within the supported accuracy,
   `POST /images/{id}/projection` shall respond 422 with a stable message.

### REQ-6 Documentation (R6)

1. **6.1** The technical documentation, `API.md`, `environment.md` and
   `design.md` shall describe the behaviour of the code after these changes.

### REQ-7 Dependencies (R7)

1. **7.1** `backend/requirements.txt` shall list only what the API and its
   tests import, with minimum versions.
2. **7.2** Notebook and ML packages shall live in a separate file that
   includes the API requirements.

## 2. Design

### 2.1 Plane alignment (REQ-1)

The image's grid is identified by its WCS reference pixel. Every window of one
exposure shares the detector's `CRPIX`, shifted by the window origin:

```text
CRPIX_window = CRPIX_detector − origin   ⇒   origin = CRPIX_detector − CRPIX_window
```

- `ImageService.plane` passes the loaded image's `(CRPIX1, CRPIX2)` (from
  `wcs_header`) and its `width × height` to
  `IrsaClient.download_plane(..., grid=(crpix1, crpix2, width, height))`.
- **Byte ranges:** `RangeReader.read_plane(url, extension, grid)` computes
  `x0 = round(CRPIX1_detector − crpix1)` (and `y0` the same way) from the
  exposure's IMAGE header. It then reads exactly that window. A non-integer
  offset (more than 1e-3 px) or a window outside the detector raises
  `PartialReadError`. The plane is always on the image's grid, so the old
  check that compared only width and height is gone (REQ-1.4).
- **Fallback:** the cutout service response is passed to
  `align_plane(content, extension, grid)` (in `integrations/irsa.py`). It
  computes the offset from the service's IMAGE `CRPIX`, copies the overlap
  into an array of the image's shape pre-filled as in REQ-1.3, and returns a
  FITS holding just that plane plus its interpretation cards (`BUNIT`,
  `MSKN*`, `MSKD*`).
- `decode_plane` keeps its shape check as a final guard.

### 2.2 Deadline (REQ-2)

- New setting `archive_budget_seconds: float = 120.0`, passed to
  `IrsaClient(budget_seconds=...)`.
- `download_cutout` and `download_plane` compute
  `deadline = time.monotonic() + budget` and pass it down.
- `with_retries(action, *, transient, sleep, deadline=None)`: before sleeping,
  if `monotonic() + delay ≥ deadline`, re-raise the error immediately.
- Each ranged GET and service GET checks the deadline:
  - It raises `requests.Timeout` if the deadline has already passed.
  - It sets the read timeout to `min(40, remaining)`.
  - It aborts the stream when `monotonic() > deadline`.
- `requests.Timeout` keeps mapping to `ArchiveTimeout` → 504.
- The per-request caps (`REQUEST_SECONDS`, `DOWNLOAD_SECONDS` = 90 s) still
  apply inside the budget.

### 2.3 Layering (REQ-3)

- `DEFAULT_BAD_FLAGS` moves to `core/config.py`.
- `services/quality.py` imports it from there. Services may depend on core,
  but not the reverse.

### 2.4 `RangeReader` (REQ-4)

```python
class RangeReader:
    def __init__(self, session: requests.Session | None = None, max_layouts: int = MAX_LAYOUTS)
    def open(self, url) -> RemoteExposure
    def read_cutout(self, url, ra_deg, dec_deg, size_deg, deadline=None) -> bytes
    def read_plane(self, url, extension, grid, deadline=None) -> bytes
    def _request(self, url, spec, limit, deadline=None)   # one ranged GET with retries
```

- `RemoteExposure` receives its reader and a deadline per call. It keeps its
  per-file `RLock`.
- `IrsaClient.__init__(ranges: RangeReader | None = None, budget_seconds=120.0)`
  creates its own `RangeReader()`. `create_app` builds one `IrsaClient` per
  app, so apps don't share state.
- The module keeps the pure helpers `pixel_window`, `_content_range` and the
  header parsing as functions.

### 2.5 Projection errors (REQ-5)

- `image_geometry.MeshError(ValueError)` is raised by `build_mesh` for
  non-finite directions, a WCS that can't be inverted, or a mesh too coarse at
  128 segments.
- `api/errors.py` maps it to 422: "This image's WCS cannot be projected
  accurately. Try a smaller size."

### 2.6 Dependencies (REQ-7)

- `requirements.txt` (API + tests): astropy, astroquery, pyvo, pyerfa,
  numpy, requests, fastapi, uvicorn, pydantic, pytest, httpx. Each gets a
  `>=` lower bound.
- `requirements-notebooks.txt`: `-r requirements.txt` plus scipy, pandas,
  matplotlib, jupyterlab, ipywidgets, scikit-learn, torch, transformers.
- `python-multipart` is dropped: no form endpoints exist.

## 3. Tasks

- [x] **T1 (REQ-3)** Move `DEFAULT_BAD_FLAGS` to `core/config.py`; `quality.py` imports it.
- [x] **T2 (REQ-4)** Introduce `RangeReader`; `IrsaClient` owns one; update range tests to use instances.
- [x] **T3 (REQ-2)** Add the deadline to `with_retries`, the ranged GETs and the service GET; add the `archive_budget_seconds` setting.
  - Tests: an expired budget gives `ArchiveTimeout`; no retry wait passes the deadline.
- [x] **T4 (REQ-1)** Grid-addressed `read_plane`, `align_plane` for the fallback, and `ImageService` passing the image grid.
  - Tests: a range plane reads the image's exact window; a shifted, same-size window is aligned, not trusted; a fallback plane that is one pixel smaller is padded (NaN / `MISSING_DATA`); a fallback plane that is one pixel larger is cropped.
- [x] **T5 (REQ-5)** `MeshError` → 422.
  - Test: a mesh failure returns 422 through the API.
- [x] **T6 (REQ-7)** Split the requirements files and update `environment.md`.
- [x] **T7 (REQ-6)** Update `API.md`, the technical documentation and `design.md` §15.
- [x] **T8** The full test suite passes.

## 4. Acceptance

- `python -m pytest tests -q` passes, including the new tests for T3–T5.
- `rg "from app\.(services|integrations|api)" app/core` finds nothing.
- `rg "^_session|^_layouts" app/integrations/irsa_ranges.py` finds nothing.
- Existing endpoint responses are unchanged for valid requests.
