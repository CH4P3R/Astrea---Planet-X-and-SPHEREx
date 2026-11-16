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

## Verification

Run `npm test` and `npm run build` from the frontend directory. For hook and UI
integration checks, run the Vite dev server and open
`/tests/comparison-browser.html` in a visible tab. The page runs deterministic
mock requests, never IRSA, and reports its checks on screen. It covers valid mission years, full-year
queries, year/detector changes, empty results, failed discovery and retries,
accumulating frames, duplicate prevention, shared scaling, chronological playback
without downloads, failed additions, removal and cancellation of stale requests.
The mock page is not part of the production entry point.
