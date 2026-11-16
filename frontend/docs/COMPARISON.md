# Compare observations

The Compare tab keeps the currently loaded observation as reference A. Its
capture year is the initial calendar year when valid, otherwise the current UTC
year is used. The selector offers only SPHEREx mission years: 2025 through the
current UTC year, newest first. There are no month or day controls. The same
detector as A is selected by default.

Opening Compare, selecting a year or changing the detector automatically searches
`GET /api/v1/images` for A's ICRS position and cutout size, with
`start_time=YYYY-01-01T00:00:00Z`,
`end_time=YYYY-12-31T23:59:59.999999Z`, and `limit=100`.
Both bounds are inclusive. The list contains observations from across the chosen
year, newest first, with each observation's full date and time visible. The range
is a calendar year, not a rolling twelve-month interval. The year is independent
of the observer's sky clock.

The list returns up to 100 observations; `has_more` displays a warning when older
matches exist. Pagination is not implemented. A successful empty list is distinct
from a failed or cancelled query, both of which can be retried. Changing filters
aborts the previous request; late responses cannot replace the current selection.
This flow does not call the optional `/images/availability` endpoint and does not
download FITS data while searching.

**Add** loads the selected ID through the existing metadata, pixels and
projection endpoints. Added observations survive subsequent searches, and
duplicate IDs cannot be added twice. A failed or cancelled addition preserves
the existing sequence. Selecting another reference A starts a new sequence.
Only one addition downloads at a time, and images with incompatible units are
rejected. The same-detector selector controls new searches; it does not remove
frames already added.

There is no fixed two-frame or alphabet-length limit. A, B, C, … labels follow
the current selection order; the timeline plays from oldest to newest and
wraps around. A remains the reference even when it is the newest frame.
Selected observations appear on one draggable timeline rather than individual
cards. The current frame's label, UTC capture time, detector and release appear
above it. Dragging the slider or using its keyboard controls pauses automatic
playback and shows that observation; during blink the same slider advances
automatically. The steps represent observations in chronological order, not
proportional elapsed time between captures. The current frame can be removed,
except A, and the other frames can be cleared together.

Previous/next, play/pause and the interval control operate on already loaded
data. Automatic playback supports 0.1 to 3 seconds per image in 0.1-second steps.
The timeline and playback controls appear above the observation browser. Compare
uses the same fixed observation summary and detector selector as Data and
Appearance; its body scrolls independently below them. Search filters and results
share a bordered area; the list grows naturally without its own nested scroll
area. A single-frame timeline is disabled
until another image is added. Available browser/GPU memory still limits very
large sequences.

All selected frames share one display range and processing options while
retaining their own dimensions, raw pixels and WCS meshes. Projections refresh
before their live window expires. Playback pauses when frames are not ready,
the sequence changes or the browser tab is hidden. Projection and optional
processing requests are bounded to three concurrent operations. Processed
copies are reused when a frame is added and released when it is removed.

Frontend changes are confined to Compare components, state and presentation
hooks, with small wiring changes in the viewport, inspector and sky renderer.
The existing image search endpoint accepts the annual date bounds; no other
toolbar workflows change. The separate metadata availability endpoint remains
available to API clients but is not used by this year-only selector.

## Playback arrow icons

`src/components/common/Arrow.jsx` contains the provided SVG with a 15 x 15
viewBox and `currentColor`. `PlaybackControls` reuses it for both previous and
next, replacing the text arrows. The previous icon rotates 180 degrees through
`.comparison-arrow--previous` in `src/styles/components/comparison.css`;
both render at 20 x 20 pixels. The buttons retain their translated accessible
labels, tooltips, blocked states and existing `playback.previous()` and
`playback.next()` callbacks from `useBlinkPlayback`. The SVG is decorative
(`aria-hidden`) so assistive technology announces the button, not the drawing.
No playback behavior or dependencies change.

## Compact GIF download

The inspector header places `DownloadRounded` immediately to the left of the
copy-link icon. Export is enabled in Compare when at least two loaded
observations, their processing and projections are ready. During export the
button is disabled and an accessible status reports progress or failure.
Copying the link remains independent.

- Export takes the first 20 loaded observations in chronological playback order,
  including A when it falls within that range. The limit applies only to the GIF,
  not to observations retained in Compare.
- Each frame uses the current playback interval. The GIF loops continuously.
- Resolution matches the rendered image element at the instant of the click,
  rather than a fixed 320-pixel preview or the FITS array dimensions. The current
  orthographic camera zoom and actual drawing-buffer size determine pixels per
  world unit, including the renderer's device pixel ratio. A common projected
  bounding box contains every selected WCS mesh; the surrounding canvas and HUD
  are not included. Zooming in or exporting on a higher-density display can
  increase GIF dimensions and file size. The GIF format's 65535-pixel dimension
  limit causes an error rather than silently downscaling. Direct encoder callers
  without a render snapshot use native image dimensions as a fallback.
- A shared 64-color palette and GIF LZW compression reduce file size. The exact
  size depends on image content and frame count; no fixed byte limit is promised.
- Frames use the current shared normalization, applied processing, exposure and
  grayscale/color palette. Original FITS pixels are unchanged.
- Every frame uses its current WCS projection mesh, sampled at one shared instant
  and rasterized into the current rendered camera basis. UV coordinates
  interpolate over each projected triangle and sample the original lower-left
  pixel grid. This preserves relative rotations, mirrored axes and celestial
  placement instead of exporting raw arrays with a universal row flip.
- This is an aligned image-sequence export, not a screenshot of the sky: it does
  not capture HUD controls, background or opacity blending. Camera zoom and
  orientation are sampled once, so subsequent movement does not change the export.
  Sources remain aligned according to the supplied WCS; this is not
  additional scientific image registration. Missing or incompatible projection
  windows cause an export error rather than an incorrectly oriented fallback.
- Changing observations, appearance, interval or availability, or unmounting the
  control, aborts the pending export and prevents a stale download.

### Responsibilities and APIs

| File | Responsibility |
| --- | --- |
| `src/export/comparisonGif.js` | `createComparisonGif` orders, rasterizes and LZW-encodes loaded frames into an `image/gif` Blob; `downloadGif` starts the download and releases its object URL |
| `src/export/gifGeometry.js` | `gifGeometry` fixes a common instant, reference orientation and bounds; `rasterProjectedPixels` samples FITS pixels through projected WCS triangles and UV coordinates |
| `src/three/core/GifRenderSnapshot.jsx` | Reads the active Three.js camera and physical drawing-buffer dimensions on click, without changing the renderer or enabling canvas preservation |
| `src/export/DownloadComparison.jsx` | React control, translated tooltip/status, duplicate-click protection and cancellation |
| `src/components/common/DownloadRounded.jsx` | Provided decorative download SVG |
| `src/components/layout/ImageInspector.jsx` | Composes download and share controls and supplies current comparison state |
| `src/styles/components/share.css`, `image-inspector.css` | Shared icon-button appearance and responsive header layout |

`chronologicalFrames` comes from `src/config/comparison.js`. React supplies
`useEffect`, `useRef` and `useState`. Geometry reuses `imageFrame` and
`projectedVertices` from `src/three/core/imageFrameUtils.js`, and `Vector3`
from the existing Three.js dependency. No additional library is required.
The export snapshots the current `useProjectedImages` results on click rather
than relying on the potentially outdated projection stored at initial download.
`Blob`, `Uint8Array`, `AbortController`,
`URL.createObjectURL`, `URL.revokeObjectURL`, DOM anchors and `setTimeout` are
browser APIs; timers yield between frames and defer URL cleanup. GIF encoding
is implemented locally, with no new library, upload or backend endpoint.
Labels and messages use the existing ES/EN `share` catalogs.

## Verification

`tests/comparisonGif.test.mjs` checks chronological order, pixel orientation,
intervals, frame/resolution limits, LZW decoding and cancellation, plus regression
cases for a 180-degree WCS rotation, mirrored axes and refreshed projections.
`tests/react/downloadComparison.test.jsx` checks control availability, repeated
clicks, success, failure and stale-export cancellation.
`tests/react/playbackControls.test.jsx` checks the SVG arrows, their callbacks
and blocked controls.

Manually verify both arrow directions, keyboard labels, the adjacent download
and copy-link buttons, and playback of the downloaded GIF in a browser.

Run `npm test` and `npm run build` from the frontend directory. For hook and UI
integration checks, run the Vite dev server and open
`/tests/comparison-browser.html` in a visible tab. The page runs deterministic
mock requests, never IRSA, and reports its checks on screen. It covers valid mission years, full-year
queries, year/detector changes, empty results, failed discovery and retries,
accumulating frames, duplicate prevention, shared scaling, chronological playback
without downloads, failed additions, removal and cancellation of stale requests.
The mock page is not part of the production entry point.
