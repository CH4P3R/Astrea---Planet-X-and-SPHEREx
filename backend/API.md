# SPHEREx image data API

Run the server from `backend` with `python -m uvicorn app.main:app --reload`.
Interactive documentation is at `http://127.0.0.1:8000/docs`.

## Endpoint index

Every path below is prefixed with `/api/v1`. The section column points to the
details in this document.

| Method | Path | Returns | Purpose | Section |
| --- | --- | --- | --- | --- |
| GET | `/images` | JSON | Search observations by RA/Dec; downloads nothing | 1 |
| POST | `/images/search` | JSON | Search from a click on the local sky | Click, load and project |
| GET | `/images/{id}` | JSON | Load a cutout and read its metadata | 2 |
| POST | `/images/load/{id}` | JSON | Same as `GET /images/{id}` | Click, load and project |
| GET | `/images/{id}/pixels` | binary | Pixel values, with optional corrections | 3, 4 |
| GET | `/images/{id}/planes/{plane}` | JSON | Describe the `flags`, `zodi` or `variance` plane | 5 |
| GET | `/images/{id}/planes/{plane}/pixels` | binary | Values of that plane | 5 |
| POST | `/images/{id}/projection` | JSON | Mesh that places the image in the 3D scene | Click, load and project |
| GET | `/stars` | JSON | Hipparcos stars up to a magnitude | Star catalog and observer sky |
| GET | `/star-catalog` | JSON | Catalog version and render metadata | Star catalog and observer sky |
| POST | `/sky` | JSON or binary | Star directions for an observer and time | Star catalog and observer sky |

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

Only the IMAGE plane is downloaded at this point (about 85 kB for a 10′
cutout). Quality flags, the zodiacal model and the variance are separate
planes fetched on demand: see sections 4 and 5.

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
No stretch, color map, reprojection or downsampling is ever applied. Without
query options there is no background subtraction or FLAGS filtering either:
the response is the untouched IMAGE plane. Display contrast and colors belong
to the renderer.

Center coordinates alone are insufficient to place a cutout on a sky map:
use the spatial WCS for accurate geometry. A full FITS download endpoint, the
PSF table and the wavelength lookup are outside this API.

## 4. Corrected pixels (optional filters)

The same endpoint accepts three independent options. Each is `false` by
default, so existing calls keep returning the raw plane.

```http
GET /api/v1/images/{id}/pixels?subtract_zodi=true&mask_flags=true&signal_to_noise=true
```

| Option | Effect on each sample | Plane used |
| --- | --- | --- |
| `subtract_zodi=true` | `IMAGE − ZODI`: removes the modelled zodiacal light, which changes between epochs. | `zodi` |
| `mask_flags=true` | Samples carrying a bad quality flag become NaN. | `flags` |
| `signal_to_noise=true` | Divides by the standard deviation, `sqrt(VARIANCE)`. The result has no unit. | `variance` |

The options combine in this order: subtract, divide, mask. The response has
exactly the same layout as the raw pixels (same `dtype`, byte order, width,
height and row order), so the same decoding code works for every combination.
Rejected or undefined samples are NaN, to be left transparent like any other
nonfinite sample. A sample is undefined when its variance is zero, negative
or nonfinite.

`signal_to_noise` divides whatever the other options produce. Alone it rates
the total signal, zodiacal light included; combine it with `subtract_zodi`
to rate sources against the sky.

`mask_flags` rejects these flags, by **name**: `TRANSIENT`, `OVERFLOW`,
`SUR_ERROR`, `NONFUNC`, `MISSING_DATA`, `HOT`, `COLD`, `PERSIST`. The list is
`Settings.bad_flags` in `app/core/config.py`. Names a file does not define are
skipped. `SOURCE` is never masked, whatever the configuration: it marks
pixels on known sources, and masking it would hide the stars.

The first request that uses an option downloads that plane from IRSA and
caches it; later requests, in any combination, are computed locally in
milliseconds. Corrected results themselves are not stored.

The metadata's `finite_min`, `finite_max`, `nonfinite_count` and `unit`
describe the **raw** plane only. After changing options the renderer must
recompute its display range from the values it received.

## 5. Extra planes (flags, zodi, variance)

Use these when the frontend prefers to combine planes itself, for example to
toggle a filter instantly without another request, or to build a custom mask.

```http
GET /api/v1/images/{id}/planes/{plane}
GET /api/v1/images/{id}/planes/{plane}/pixels
```

`plane` is `flags`, `zodi` or `variance`. Any other value is HTTP 422. The
first endpoint returns JSON; the second returns `application/octet-stream`.
Either one downloads the plane on first access and uses the cache afterwards.
The image is loaded first if it was not already.

Every plane lies on **exactly the same pixel grid** as the image's pixels:
same `width`, `height`, row order and element index `y * width + x`. Element
`i` of a plane describes element `i` of the pixels.

| Plane | FITS extension | `dtype` | Bytes per sample | Meaning |
| --- | --- | --- | --- | --- |
| `flags` | `FLAGS` | `int32` | 4 | Bitmask of per-pixel status and processing flags. |
| `zodi` | `ZODI` | `float32` | 4 | Modelled zodiacal light, in the image's unit (MJy/sr). Not subtracted from IMAGE. |
| `variance` | `VARIANCE` | `float32` | 4 | Per-pixel variance, in the image's unit squared. |

The JSON contains:

- `image_id`, `plane`, `extension`, `width`, `height`.
- `dtype`, `byte_order: "little"`, `array_order: "C"`,
  `pixel_origin: "lower-left"`: decode like the image's pixels.
- `unit`: the extension's BUNIT, or `null` when it states none (FLAGS).
- `pixels_url`: where to read the binary values.
- `flag_bits`: for `flags`, the bit definitions read from this file's header,
  as `{bit, name, description}` sorted by bit. A sample carries a flag when
  `(value >> bit) & 1` is 1. Empty for the other planes.
- `masked_flags`, `masked_bits`: for `flags`, the names that `mask_flags=true`
  rejects in this file and their combined bitmask. A sample is rejected when
  `(value & masked_bits) !== 0`. Empty and `0` for the other planes.

Bit assignments belong to each file: always take them from `flag_bits`
instead of hard-coding numbers. In current QR3 files the header defines 22
flags, among them bit 0 `TRANSIENT`, 10 `HOT`, 12 `FULLSAMPLE` and 21
`SOURCE`. `FULLSAMPLE` and `SOURCE` are informational, not defects.

Plane values are never altered: zodi and variance keep NaN and infinity,
and flags keep every bit.

## 6. Using the filters from the frontend

Nothing in the existing flow has to change: search, metadata, pixels and
projection behave as before. The filters are additions.

### Simplest: let the backend apply them

Give each filter a checkbox and rebuild the pixels URL from their state. The
decoding code is the one already used for raw pixels.

```js
async function loadPixels(apiBase, image, filters) {
  // image: the JSON from GET /api/v1/images/{id}; filters: three booleans.
  const url = new URL(apiBase + image.pixels_url);
  if (filters.subtractZodi) url.searchParams.set("subtract_zodi", "true");
  if (filters.maskFlags) url.searchParams.set("mask_flags", "true");
  if (filters.signalToNoise) url.searchParams.set("signal_to_noise", "true");
  const response = await fetch(url);
  if (!response.ok) throw new Error((await response.json()).detail);
  const Values = image.image.dtype === "float32" ? Float32Array : Float64Array;
  return new Values(await response.arrayBuffer());   // length = width * height
}
```

Then, with the returned values: treat NaN and ±infinity as transparent, and
recompute the display range (for example the 1st and 99.5th percentiles of
the finite values), because each combination changes the range. Show a
"loading" state on the first use of each filter: that request waits for IRSA.

### Alternative: combine planes in the browser

Fetch a plane once and apply it locally, so toggling costs no request.

```js
const base = `${apiBase}/api/v1/images/${image.id}/planes`;
const info = await (await fetch(`${base}/flags`)).json();
const flags = new Int32Array(await (await fetch(apiBase + info.pixels_url)).arrayBuffer());
const zodi = new Float32Array(await (await fetch(`${base}/zodi/pixels`)).arrayBuffer());

const shown = new Float32Array(pixels.length);
for (let i = 0; i < pixels.length; i += 1) {
  const bad = (flags[i] & info.masked_bits) !== 0;
  shown[i] = bad ? NaN : pixels[i] - zodi[i];
}
```

Typed arrays read the platform's byte order, which is little-endian on every
current desktop and mobile browser, matching the payload.

### What each filter costs

Measured on 14 November 2026 for one 10′ cutout (about 98 × 98 pixels). The
network to IRSA varies, so treat the times as a guide.

| Step | Downloaded from IRSA | Typical wait, first time |
| --- | --- | --- |
| Load the image (`GET /images/{id}`) | about 85 kB | about 2 s |
| First use of `subtract_zodi`, or the `zodi` plane | 40–130 kB | under 1 s |
| First use of `signal_to_noise`, or the `variance` plane | 40–130 kB | under 1 s |
| First use of `mask_flags`, or the `flags` plane | about 500 kB | 1–3 s |
| Any later request for the same image | nothing | milliseconds |

Each plane costs its own bytes plus up to 90 kB of header reads when it is
the first one requested after the image.

FLAGS is the expensive plane, which is why it is not loaded with the image.
The response sent to the browser is always `width * height * 4` bytes
(39 kB here), whatever the options.

## Errors and storage

| Status | Meaning |
| --- | --- |
| 422 | Invalid coordinates, dates, limits, size, detector, or malformed ID. |
| 404 | Unknown ID; run a search to register it on this backend. |
| 502 | IRSA request failed or the returned FITS could not be decoded. |
| 504 | IRSA timed out. |
| 503 | The local cache is unavailable. |

Errors include `detail`; request-validation details are FastAPI's structured
list. Upstream/internal exception traces stay in server logs. The same
statuses apply to the plane endpoints and to the pixel options; 422 also
covers an unknown plane name or a non-boolean option.

IRSA sometimes answers 502 or 503 ("Server busy"), or drops a connection, for
a few seconds. The backend retries those failures twice, after 1 s and 2.5 s
(honouring a short `Retry-After`), before reporting 502. Timeouts are not
retried. A 502 therefore means IRSA stayed unavailable for several seconds:
the frontend should offer the user a retry rather than retry in a loop.

The cache lives in `backend/data/image-cutouts/`, already excluded by the
repository's `.gitignore`. It contains small search selections, metadata JSON,
decoded binary pixels and, once requested, each extra plane as
`{id}.flags.bin`, `{id}.zodi.bin` or `{id}.variance.bin` with a JSON
description beside it. Full FITS files are not persisted. IDs survive a
restart as long as this directory is preserved. There is currently no disk
quota or automatic eviction; clear this generated directory with the server
stopped when needed. A cleared ID must be registered by searching again.
Downloads of the same image are serialized within each worker; separate
workers can fetch it concurrently, but cache files are published atomically.

## How cutouts are downloaded

The backend does not use IRSA's cutout service for normal loads. That service
returns all six extensions of an exposure, including a 4 MB PSF table,
however small the cutout: about 4.1 MB and 6–10 s for 10′. Instead the backend
reads the remote FITS by HTTP byte ranges: first the headers, then only the
pixel rows of the requested window, one plane at a time. The same 10′ image
costs about 85 kB and 2 s, with pixel values identical to the service's.

FLAGS is stored compressed, one tile per full detector row, so its window
costs whole rows; the other planes cost only their own pixels. The PSF table
is never downloaded.

The window is computed from the exposure's WCS and may differ from the cutout
service's by one pixel along an edge. As before, `width` and `height` in the
metadata are the authority, not the requested size.

If a file cannot be read by ranges (the server ignores `Range`, or the file's
layout is not the expected one), the backend falls back to the cutout
service automatically. The API response is the same; only the load is slower.

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

The prototype's three image filters map onto the pixel options of section 4:
"Apply quality flags" is `mask_flags=true`, "Subtract zodiacal background" is
`subtract_zodi=true`, and "Show signal-to-noise" is `signal_to_noise=true`.
Unlike the prototype, the backend returns no separate mask and no suggested
stretch: masked samples arrive as NaN inside the pixels, and the display
range is the renderer's to compute. Spectra, the wavelength lookup and the
PSF remain out of scope.

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
3. `GET /api/v1/images/{id}/pixels`: numeric image values as described above,
   optionally with the filters of section 4.
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
