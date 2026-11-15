# Astrea — Blink through the existing image API: design

- **Date:** 2026-11-14
- **Status:** prototype approach selected; frontend integration remains future work.
  Existing image endpoints are implemented. This document does not implement a viewer.
- **Scope:** backend data contract and frontend responsibilities. No frontend
  implementation is included in this specification change.
- **Historical proposal:** [`2026-11-14-spherex-blink-viewer-design.md`](2026-11-14-spherex-blink-viewer-design.md).
  This document supersedes its blink architecture, endpoints, rendering pipeline,
  milestones and acceptance requirements where they conflict.
- **Current backend:** [`2026-11-14-astrea-backend-technical-documentation.md`](2026-11-14-astrea-backend-technical-documentation.md)
  and [`backend/API.md`](../../../backend/API.md).

## 1. Decision and rationale

Follow the prototype: load two observations, position each through its own WCS
mesh on the same observer sky, and alternate their visibility in the frontend.
The backend supplies pixels, metadata and observer-relative geometry. It does
not run playback, select a comparison partner, render PNGs or resample the
images onto a shared pixel grid for this initial feature.

This reuses working endpoints and keeps the first integration small. WCS meshes
place corresponding sky directions together despite different exposure rotations;
putting two unpositioned rectangular textures at the same screen coordinates
would not provide that alignment.

This is a visual comparison, not proof of motion or variability. Different
wavelengths, PSFs, backgrounds, coverage and detector artifacts can change the
appearance. A common pixel grid and additional calibration become useful for
pixel subtraction or quantitative analysis, but are not prerequisites for this
visual blink.

The initial interaction is A/B, **not a permanent two-observation limit**.
Future playback may sequence three or more selected observations. That sequence
and its controls will also remain in the frontend; each observation continues
to use the same independent backend data contract.

## 2. Responsibilities

| Backend | Frontend |
| --- | --- |
| Discover observations with Astroquery SIA; return dates, detector and IDs | Select A and B from the available results |
| Download a selected FITS cutout from IRSA on demand | Keep loaded observations available during playback |
| Decode IMAGE into raw pixels and metadata, retaining native precision | Decode float32/float64 according to metadata and create textures |
| Build each image's WCS mesh and project it for the observer/time | Draw each image with its own mesh and texture coordinates |
| Cache decoded data independently by observation and requested cutout | Alternate visibility, show dates, play/pause and control interval |
| Supply documented errors and limits | Apply one shared display scale and handle loading/errors |

There is no new `/blink` or `/frames` API in the initial scope. Retries,
quality processing, background subtraction and offline pre-warming are separate
improvements, not mandatory dependencies of A/B playback.

## 3. Existing API to reuse

All routes below have the `/api/v1` prefix.

| Method and path | Role |
| --- | --- |
| `POST /images/search` | Convert the clicked local direction to ICRS and discover observations |
| `GET /images?ra_deg=...&dec_deg=...&size_deg=...` | Alternative search with known ICRS coordinates |
| `POST /images/load/{id}` | Download/decode the selected cutout and return metadata |
| `GET /images/{id}` | Equivalent metadata/load alternative; do not call both unnecessarily |
| `GET /images/{id}/pixels` | Raw image values as little-endian float32 or float64 |
| `POST /images/{id}/projection` | Per-image mesh UVs, indices and local directions at requested times |

Search returns `images`, `query`, `has_more` and `order`. Results are newest
first. The frontend filters/sorts candidate dates for selection; it must not
interpret this limited result as the complete observation history. Use date
bounds or a new search when necessary. Pagination is future work.

Search does not download FITS files. Loading an ID downloads its cutout once
when cold; subsequent metadata/pixel requests use the cache. Pixel or projection
requests can also trigger a cold load. No archive request is needed at each
A/B visibility switch.

Each observation keeps its own dimensions, dtype, pixels and WCS. Preserve the
existing opaque IDs: they identify source URL and requested cutout geometry,
not the pair or playback state. Search the same center and cutout size for the
observations being compared.

## 4. Frontend integration flow

1. Prepare the observer sky using `/star-catalog` and `/sky` as documented in
   `backend/API.md`. Preserve the observer and displayed time.
2. Search from a click, or use known RA/Dec. Display an empty state if no
   observations are returned.
3. Select observation A, load its metadata and fetch its pixels.
4. Select B from observations with a different ID and observation time.
   Load B's metadata and pixels independently; show loading/retry for B while
   keeping A visible.
5. Request `/images/{id}/projection` for both using the **same** `observer`,
   `at` and `mode`. Image exposure dates are labels describing the source data;
   `at` is the displayed observer-sky time, not a filter on exposure dates.
6. Construct each texture with its own `image.width`, `image.height` and dtype,
   and use that image's returned `uv`, `indices` and `directions`. Do not reuse
   A's mesh for B or assume equal image dimensions.
7. Once both images and their projections are usable for the displayed time,
   enable Show A / Show B / Blink. Alternate visibility every 1 s by default,
   adjustable from 0.5 to 3 s, as in the prototype. Always show the current
   observation date and label.
8. When observer or displayed time changes, refresh projections and sky samples.
   Reuse pixels. In live mode, refresh before the 120-second sample window
   expires; use the same time basis for stars and all image projections.
9. Changing the selected observations invalidates playback readiness. Ignore
   stale responses and stop playback until the new selection is ready.

The frontend owns the timer. Both observations stay loaded while blinking;
there is no repeated FITS download or backend animation job.

## 5. Selection and spectral interpretation

Mirror the prototype's progressive comparison choices:

- **Dates only:** a different observation time; other detectors may be included.
  Clearly label detector differences rather than treating this as a controlled
  variability measurement.
- **Same detector:** additionally require matching detector numbers. This is a
  useful first comparison, but does not guarantee identical wavelengths because
  SPHEREx wavelength varies across a detector.
- **Similar wavelength at the target:** future capability in Astrea. The
  prototype has a heuristic based on target wavelength and bandwidth. Our
  current API does not provide `target_spectrum`; do not expose this choice as
  supported until the corresponding FITS wavelength processing is implemented.

These filters operate on the available search results. Do not silently broaden
an explicitly chosen detector or imply that more search results were loaded.

## 6. Shared display scale and missing pixels

The frontend applies the same brightness bounds, stretch, exposure adjustment
and color mapping to both images. Require compatible physical units; if units
are missing or different, disable comparison or explicitly resolve that case.
Do not autoscale each image independently while switching.

The prototype combines its two backend-provided `stretch_min`/`stretch_max`
ranges. Astrea currently returns raw pixels and finite min/max statistics,
not percentile stretch suggestions. The frontend must derive one shared range
from the loaded finite values (for example, a percentile range from their
combined values), then keep it fixed during playback. Min/max are statistics,
not guaranteed useful display contrast. Handle constant or entirely nonfinite
images explicitly.

Pixels keep lower-left origin and little-endian encoding. Nonfinite values
must be made transparent by the renderer. This is not a FLAGS quality mask.
Compare the overlapping footprint: boundaries and missing coverage may differ.
The prototype's optional quality masking is not implemented in Astrea yet.

## 7. Differences from the prototype contract

The interaction is similar, but the old frontend cannot be pointed at the new
backend without adapting its data mapping:

| Prototype | Current Astrea |
| --- | --- |
| `/api/...` | `/api/v1/...` |
| Search `results` | Search `images` |
| Flat image dimensions and display metadata | Dimensions, dtype and WCS under `image` |
| Mesh UVs/indices returned at load | Mesh UVs/indices returned by `/projection` |
| Always float32 preview | Preserve float32 or float64, without preview downsampling |
| `stretch_min`, `stretch_max` | Raw values and finite statistics; shared display range computed by frontend |
| Optional mask endpoint and quality toggle | Not yet available; raw IMAGE only |
| Wavelength comparison using `target_spectrum` | Future wavelength metadata processing |
| Larger selectable fields | Current cutout maximum 0.5 degrees / 30 arcminutes |

## 8. Acceptance for the initial integration

- Two observations of the same region can be loaded via the existing endpoints.
- Both use their own WCS geometry with the same observer/time; overlapping
  stationary sky positions coincide within the geometry's documented tolerance.
- Playback waits for pixels and usable projections for both observations.
- Show A / Show B / Blink work without additional archive downloads per switch.
- One shared display scale is applied, and the visible observation's date and
  detector are always identifiable.
- Empty results, one observation, incompatible units, unavailable projections
  and failed B loads produce a clear state without discarding a usable A.
- An invalid/outdated selection cannot start or continue playback.
- A visible difference is labelled as visual comparison, not a confirmed change.

Backend verification uses the existing search→load→pixels→projection tests.
Frontend playback/rendering tests belong to the frontend team's implementation.
These acceptance criteria do not claim that the current frontend implements blink.

## 9. Optional future work

The following items require their own implementation and validation; they are
not implicitly included by adopting this specification:

1. **More than two observations:** a frontend-managed ordered collection of
   observation IDs, individual readiness/error states, and a playback index.
   Support stepping, play/pause and epoch labels across the selected sequence.
   Keep one shared display scale across the sequence, or recompute it explicitly
   when the selection changes. Use bounded loading and browser-memory limits;
   avoid relying on a permanent A/B-shaped data model. The backend continues
   serving each observation independently. Full-history search or pagination
   may be needed for broader time coverage.
2. **Quality and background variants:** optional FLAGS masking and IMAGE − ZODI,
   with processing provenance; preserve the existing raw-pixel contract.
3. **Target wavelength metadata:** enable the prototype's optional spectral
   comparison once supported by the backend.
4. **Download retries and pre-warming:** improve availability; an offline demo
   additionally needs cached discovery, not just cached decoded images.
5. **Common-grid reprojection and difference analysis:** a separate opt-in
   processing feature for pixel subtraction or measurements. WCS positioning
   alone does not make array indices comparable; subtracting A[i] − B[i] is
   invalid unless the grids are aligned. Further PSF/background/spectral
   treatment may also be required for scientific interpretation.

Even if common-grid processing is introduced later, playback and rendering
remain frontend responsibilities.
