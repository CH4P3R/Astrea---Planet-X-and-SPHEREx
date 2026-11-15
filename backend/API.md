# SPHEREx image data API

Run the server from `backend` with `python -m uvicorn app.main:app --reload`.
Interactive documentation is at `http://127.0.0.1:8000/docs`.

## 1. Search observations

```http
GET /api/v1/images?ra_deg=210.80227&dec_deg=54.34895&size_deg=0.1&detector=2&limit=20
```

| Parameter | Meaning |
| --- | --- |
| `ra_deg` | Required ICRS right ascension, degrees, `0 <= ra < 360`. |
| `dec_deg` | Required ICRS declination, degrees, `-90 <= dec <= 90`. |
| `size_deg` | Required side of the requested square cutout in degrees, `0 < size <= 0.5`. This is not a search radius. |
| `detector` | Optional integer from 1 to 6. Omit to include all detectors. |
| `limit` | Maximum returned observations, 1–100; default 20. |
| `start_time` | Optional inclusive lower bound on observation **start**, ISO 8601 with a timezone. |
| `end_time` | Optional inclusive upper bound on observation **start**, ISO 8601 with a timezone. |

For example, `start_time=2026-01-01T00:00:00Z`. Date-only values are rejected;
the API never guesses a timezone. Both bounds filter the start of an exposure,
not any overlap with its duration. NaN and infinity are rejected in inputs.

The backend uses Astroquery's IRSA SIA interface to select Level 2 FITS files
from DR1 and QR3 (wide and deep surveys) whose footprints intersect a one-arcsecond cone around the requested
point (the introductory notebook convention). It deduplicates URLs, filters detector and observation start time, then
orders by observation start descending, with the archive URL breaking ties.
SIA interval-overlap filtering is also applied upstream when dates are supplied.
Search retrieves up to 10,000 metadata rows; truncated responses are rejected
with HTTP 422 asking for narrower dates, rather than returning misleading order.

The response contains `query`, `images`, `order`, and `has_more`. Each image
includes an opaque `id`, `observation_id`, `detector`, `collection`,
`observation`, `requested`, `source_url`, `metadata_url`, and `pixels_url`.
`collection` identifies the release (`dr1` or `qr3`), not a separate wide/deep
survey selection. `source_url` points to the original full FITS for provenance;
use the API URLs to retrieve the selected cutout's data.

Observation timestamps come from SIA's `t_min`/`t_max` MJD time bounds and are also supplied
as ISO UTC strings. Missing archive metadata is `null`. FITS `DATE` is retained
as header metadata, never substituted for the observation timestamp.

Search does **not** download FITS files. An empty result is HTTP 200 with
`images: []`. `has_more: true` means older matches exist beyond this limited
result; this endpoint does not yet implement pagination.

## 2. Read a selected cutout's metadata

```http
GET /api/v1/images/{id}
```

Use the ID returned by search. It identifies the archive file, requested
coordinates, cutout size, and cache format version. On the first access the
backend downloads and decodes this cutout; subsequent accesses use the disk
cache. Calling the pixels endpoint first also prepares the cache.

The response repeats the search entry and adds `image`:

- `width`, `height`: actual dimensions, which may differ from the requested
  footprint near an exposure edge.
- `dtype`: `float32` or `float64`; `byte_order: "little"`; `array_order: "C"`;
  `pixel_origin: "lower-left"`.
- `unit`: FITS BUNIT, normally MJy/sr, or `null` if absent.
- `finite_min`, `finite_max`, `nonfinite_count`: descriptive statistics only.
  Min/max are `null` when no finite pixels exist.
- `center`: actual image center in ICRS degrees, distinct from `requested`.
- `footprint`: outer-edge corners in ICRS degrees, ordered lower-left,
  lower-right, upper-right, upper-left in the original image grid.
- `wcs_header`: celestial WCS cards, including distortion terms when present.
  WCS header reference pixels use the FITS one-based convention; array indices
  use zero-based coordinates. Keep the cards together when reconstructing WCS.
- `fits_metadata`: original identity, detector, processing version, and selected
  header fields. These supplement the archive metadata without inventing values.

## 3. Read pixel values

```http
GET /api/v1/images/{id}/pixels
```

Returns `application/octet-stream`, **not a PNG or a FITS container**. Decode
according to the metadata's dtype and byte order. The payload has
`width * height` numbers, occupying 4 bytes per float32 or 8 per float64.
The value at `(x, y)` is element `y * width + x`. Row zero is the original
FITS lower row; canvas drawing may need a vertical flip.

Values preserve the IMAGE plane's numerical scale, including negative values,
NaN, and infinity. Nonfinite samples are not valid brightness measurements;
the renderer should leave them transparent. This is **not** a quality mask.
No stretch, color map, reprojection, downsampling, background subtraction or
FLAGS filtering is applied. Display contrast and colors belong to the renderer.

Center coordinates alone are insufficient to place a cutout on a sky map:
use the spatial WCS for accurate geometry. A full FITS download endpoint and
other extensions are outside this initial API.

## Errors and storage

| Status | Meaning |
| --- | --- |
| 422 | Invalid coordinates, dates, limits, size, detector, or malformed ID. |
| 404 | Unknown ID; run a search to register it on this backend. |
| 502 | IRSA request failed or the returned FITS could not be decoded. |
| 504 | IRSA timed out. |
| 503 | The local cache is unavailable. |

Errors include `detail`; request-validation details are FastAPI's structured
list. Upstream/internal exception traces stay in server logs.

The cache lives in `backend/data/image-cutouts/`, already excluded by the
repository's `.gitignore`. It contains small search selections, metadata JSON,
and decoded binary pixels. Full FITS files are not persisted. IDs survive a
restart as long as this directory is preserved. There is currently no disk
quota or automatic eviction; clear this generated directory with the server
stopped when needed. A cleared ID must be registered by searching again.
Downloads of the same image are serialized within each worker; separate
workers can fetch it concurrently, but cache files are published atomically.

## Sources

- [Official IRSA spectral-image cutouts tutorial](https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/)
- [SPHEREx data access](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/)
- Local reference: `notebooks/02-spectral-image-cutouts/spherex_cutouts.md`.


## Prototype-style frontend flow

Only backend data and geometry are supplied; rendering and interaction belong
to the frontend. Routes use `/api/v1`, rather than the prototype's `/api`.
The workflow is similar, but the JSON contract is not a drop-in replacement:
image metadata stays under `image`, raw pixels retain their native float type,
and image mesh UVs/indices are supplied by the projection endpoint.
Quality masks, spectra and other FITS extensions remain out of scope.

### Star catalog and observer sky

- `GET /api/v1/stars?magnitude_limit=7`: list of Hipparcos stars with HIP ID,
  ICRS RA/Dec in degrees at J1991.25, apparent magnitude, B−V, display color,
  and proper motion in arcseconds/year. Missing measurements remain null.
  Magnitude limit is inclusive, between −2 and 15; smaller values select
  brighter stars. These are catalog stars, not detections extracted from FITS.
- `GET /api/v1/star-catalog`: stable catalog version and static star render
  metadata, sorted by magnitude then HIP ID, matching sky snapshot order.
- `POST /api/v1/sky`: directions for the observer's location and time. The
  request below returns JSON. `mode: "paused"` produces one sample; `live`
  produces 13 samples at 10-second intervals across the next 120 seconds.

```json
{
  "observer": {"latitude_deg": 14, "longitude_deg": -89, "elevation_m": 0},
  "at": "2026-11-14T18:00:00Z",
  "mode": "paused",
  "magnitude_limit": 7,
  "format": "json"
}
```

Directions use +X east, +Y up, −Z north, as in the prototype. Each sample is
flat `[x0,y0,z0,x1,y1,z1,...]`, aligned with the selected stars. Optional
`catalog_version` detects stale catalog metadata (HTTP 409). Optional
`format: "binary"` uses the prototype's SKY1 format: four ASCII magic bytes,
a little-endian uint32 JSON header length, a space-padded JSON header aligned
to four bytes, then float32 little-endian directions in sample/star/XYZ order.

The catalog comes from VizieR (`I/239/hip_main`), independently of SPHEREx SIA.
Its first request downloads the complete catalog; later requests use memory
or `backend/data/hipparcos-v1.json`. Coordinates include proper motion when
calculating the local sky. No atmospheric refraction or stellar parallax is
assumed. Observer conversions require IERS Earth-orientation coverage;
unavailable dates return HTTP 422 instead of silently extrapolating.

### Click, load and project a FITS image

1. `POST /api/v1/images/search`: send a local direction vector together with
   the same observer and displayed time used for the sky. This converts the
   click to ICRS and searches SIA. If the frontend already knows ICRS RA/Dec,
   the existing `GET /api/v1/images?...` remains available.
2. `POST /api/v1/images/load/{id}`: load the chosen observation's FITS cutout
   and return metadata. This is equivalent to `GET /api/v1/images/{id}`.
3. `GET /api/v1/images/{id}/pixels`: numeric image values as described above.
4. `POST /api/v1/images/{id}/projection`: send `observer`, `at`, and `mode`
   to obtain local mesh directions, center directions, `sample_times_ms`,
   `uv`, and triangle `indices`. Use the same time samples as the stars.
   UV vertices correspond to pixel edges and preserve lower-left row order.

Example click request (+Y is the zenith):

```json
{
  "direction": [0, 1, 0],
  "observer": {"latitude_deg": 14, "longitude_deg": -89, "elevation_m": 0},
  "at": "2026-11-14T18:00:00Z",
  "mode": "paused",
  "size_arcmin": 6,
  "detector": 2,
  "limit": 20
}
```

`size_arcmin` defaults to 6 and is limited to 30 arcminutes for this initial
backend (the prototype allowed larger fields). The search response retains
`query`, `images`, `has_more`, and `order`. Optional `start_time`/`end_time`
filter exposure dates; `at` is the displayed sky time, not an exposure filter.
DR1 and QR3 are searched together. A click can return multiple observations
or no observations; no image is downloaded until an ID is loaded.

Use `/docs` to test POST requests; the browser address bar only sends GET.
