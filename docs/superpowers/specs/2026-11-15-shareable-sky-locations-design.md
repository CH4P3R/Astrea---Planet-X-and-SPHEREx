# Shareable sky locations — design

Status: Draft, awaiting user approval.

## Intent and agreed scope

Let someone share an Astrea celestial region without asking the recipient to
enter coordinates manually. This shares a search, not a frozen observation or
an exact reproduction of a viewing session.

User decisions:

- Include celestial coordinates and search settings.
- Keep the address bar synchronized and provide a Copy link action (option 1).
- Exclude the sender's geographic location and other viewing-session state.

The remaining behavior below is the proposed design, not yet user-approved.

## Approaches

1. **Synchronized URL plus Copy link — selected.** Submitted searches update
   the current history entry. Reloads, bookmarks, and copied addresses restore
   the region. Requires explicit startup and URL/state ownership.
2. **Copy link only — not selected.** Less synchronization work, but the address
   bar, bookmarks, and reloads would not preserve the current search.

Use browser URL and History APIs and existing React state. No router, global
state library, short-link server, or backend change is needed.

## URL contract

Example:

```text
https://<astrea-host>/?ra=269.452&dec=4.693&size=7&detector=0
```

| Parameter | Meaning | Accepted values | Missing value |
| --- | --- | --- | --- |
| `ra` | Right ascension, degrees | finite decimal, `0 <= ra < 360` | invalid if any supported search parameter is present |
| `dec` | Declination, degrees | finite decimal, `-90 <= dec <= 90` | invalid if any supported search parameter is present |
| `size` | Cutout width, arcminutes | finite decimal, `0.1 <= size <= 30` | current default, 7 |
| `detector` | Search detector filter | integer `0..6`; 0 means any | 0 |

These are public frontend parameters, not the backend's parameter names.
`size` is deliberately not `fov`: it controls the cutout request, not the camera.
Serialization writes all four fields in the order above, without deliberately
rounding away coordinate precision. Normalize negative zero to zero.

Validation:

- No supported parameters: ordinary app startup, including normal onboarding.
- At least one supported parameter: require a complete valid coordinate pair.
- Reject blank values, nonfinite values, hexadecimal notation, trailing junk,
  out-of-range values, and duplicate supported keys. Decimal scientific
  notation may be accepted; URL encoding must preserve any plus sign.
- A malformed supported parameter invalidates the whole shared search.
  Do not silently clamp coordinates or discard an invalid detector filter.
- Invalid links produce a localized, nonblocking warning and no archive request.
  Open the normal workspace search panel for correction; suppress automatic
  onboarding for this visit so it does not conceal that warning. Do not change
  stored onboarding status. Preserve the malformed URL until a valid submit or
  explicit Clear action.
- Unknown parameters, including historical `fov`, `collection`, and `speed`,
  are not interpreted. This feature has no previously implemented URL format
  to migrate. A URL containing only unknown keys is an ordinary startup.
- Parse into structured data; never render parameter strings as HTML or treat
  them as endpoints, redirects, or arbitrary backend arguments.

## What a recipient sees

```text
Open a valid link
  -> normal workspace, search fields populated
  -> search runs once, with the supplied size and detector
  -> no observations: existing empty-result message
  -> observations found:
       observer available -> load/project latest matching image -> existing focus
       observer pending   -> keep results and show location requirement
       observer denied    -> offer existing device/manual location controls
                             -> load when location becomes available
```

A valid link bypasses automatic first-visit onboarding only for that visit.
It does not mark the tour completed or skipped. Help can still launch the tour.
The tutorial workspace never reads, writes, clears, or shares the normal
workspace's URL state.

Retain the app's existing device-location request and manual-location fallback.
Do not invent an observer, request the sender's location, or put observer
coordinates in the URL. Keep the recipient's live/default clock behavior.
Consequently the sky orientation depends on their observer/time, and the newest
matching archive image may change over time.

When results arrive before observer availability, retain a pending auto-load
intent tied to that search. Consume it once when observer and renderer readiness
permit loading. Cancel, Clear, a replacement search, and unmount invalidate that
intent. An observer change must not retry a failed load or undo cancellation.
Use existing loading, empty, network-error, retry, and camera-focus behavior.
Do not claim region centering when no projected image can be displayed.

## Committed search versus form drafts

Maintain one committed search record: `{ ra, dec, size, detector }`.
This is the source for the URL and Copy link, not whichever image is displayed.

- A valid coordinate submission commits the requested search when dispatched.
  Network failure, no observations, and cancellation retain this search in the
  URL so it can be retried or shared.
- A sky-click search has a local direction rather than RA/Dec. Commit its
  celestial coordinates only when the backend resolves a successful response.
  Until then, disable Copy link; do not manufacture RA/Dec in the browser.
  Failure/cancellation leaves the previous committed URL unchanged.
- Detector selection commits a new filter for the same committed region and
  cutout size when its repeat search is dispatched. Do not derive the filter
  from image metadata: a search with detector 0 can return an image on detector 3.
- Draft RA/Dec/size edits do not change the URL or the committed search.
  Canceling preparation restores the last committed values in the form.
- A detector-only repeat uses the last committed size, not an unsubmitted size
  edit. Preserve existing new-search behavior of defaulting to any detector;
  URL restoration explicitly supplies its detector atomically.
- Hydration and browser navigation replace the controls together, not through
  several setters followed by searches with stale values. Update populated
  controls after resolved sky-click searches too.
- Explicit Clear or inspector Close clears the committed search and removes
  the four supported URL parameters. Preserve existing size-draft/reset
  semantics unless needed to keep displayed controls truthful.

Cancellation stops work, not the meaning of a valid submitted search.
Errors should never replace a valid shared region with image metadata from a
previous successful request.

## URL synchronization and lifecycle

- One normal-workspace integration owns URL reads/writes and navigation.
  Parse the initial URL before deciding whether to open onboarding.
- Use `history.replaceState`, preserving existing history state, origin,
  pathname, hash, and unrelated query parameters.
- Write on committed-search changes only. No updates on clock ticks, camera
  motion, draft keystrokes, image projection refreshes, or tutorial changes.
- Compare the desired URL before writing; no redundant history calls.
- Handle `popstate`: re-parse the current URL, update controls, cancel obsolete
  work, and restore the new search without creating a history loop. An entry
  without supported parameters clears the current shared-search state; it
  does not relaunch onboarding mid-session. Invalid navigation cancels old
  work and shows the invalid-link state, without starting a new request.
- A shared search starts once per initial load or distinct navigation event.
  React effect setup/cleanup must not leave duplicate active requests, consume
  an intent whose only request was aborted, or overwrite initial parameters
  with defaults. Test this under development Strict Mode.
- Opening/replaying the tour must not replay initial hydration on return.
- Reuse AbortController cancellation and guard stale responses so an older
  search/load cannot replace a newer region or restore a cleared URL.
- If browser history mutation throws, keep search functional, show a
  nonblocking synchronization warning, and allow Copy link from committed data.

No custom per-search Back/Forward history is introduced: replaceState is the
agreed approach. popstate support handles existing browser history entries.

## Copy link interaction

Provide the same small, reusable Copy link control in the search panel footer
and image-inspector summary. It stays available for empty or failed searches in
the search panel, not just for successfully loaded images.

```text
Search panel:  [Search] [Clear] [Copy link]
                            Link copied

Inspector summary:
Observation / detector / release
[Copy link]
```

- Enable only with a valid committed search; disable while a sky-click search
  has not yet resolved celestial coordinates.
- Copy a newly constructed, absolute URL from the current origin/path and
  allowlisted committed fields. Do not copy unrelated query parameters or
  the hash into the generated share link; these may contain private state.
  Address-bar synchronization still preserves them.
- Use `navigator.clipboard.writeText` from the button's user gesture.
- If clipboard access is missing or denied, reveal a read-only, selectable
  link and instructions for manual copying. Never report success on rejection.
- Announce success/failure through an accessible status message; do not steal
  focus on success. Label the fallback input and provide keyboard access.
- Use existing button, spacing, panel, and status styles. No visual redesign,
  new modal, native-share integration, or new icon library.
- Add English and Spanish strings consistent with existing i18n.
- Do not show sharing controls in the tutorial.

## Implementation boundaries

Expected touch points (the implementation plan will specify exact edits):

- A pure URL parse/serialize helper and its tests.
- A small React URL integration owned outside the tutorial workspace.
- `AppViewport`: initial URL classification and onboarding precedence.
- `AppWorkspace`: restored-search intent, committed search events, navigation,
  status feedback, and share-control wiring.
- `useFitsImage`: atomic search settings, committed query lifecycle,
  observer-delayed loading, and stale-request protection.
- `FitsControls` / `ContextToolbar`: externally restored form values,
  commit-versus-draft behavior, shared-link warning and Copy link.
- `ImageInspector`: Copy link without conflating detector metadata/filter.
- Existing localization files and minimal existing-style CSS where necessary.
- Test harness/config changes only where needed to execute real React
  lifecycle tests. Existing Node tests do not execute hooks.

No Zustand/router addition, backend contract changes, collection selector,
camera-pose URL, image-ID persistence, comparison/session persistence,
account system, URL shortener, or unrelated review remediation.

## Acceptance and verification

Automated pure-logic tests:

- Parse/serialize round trips including RA 0, near 360, both poles, decimal
  precision, default settings, and detector 0 versus 1..6.
- Missing/blank/duplicate/invalid fields; bounds; nonfinite numbers;
  unsupported keys; deterministic output.
- Synchronization preserves unrelated query/hash/history state. Generated
  share links include only allowlisted fields.

Executable React/browser tests with mocked archive, location, clipboard, and
history boundaries (not source-string assertions):

- Cold shared-link startup: atomic settings, matching first request, no
  onboarding interception and no transient default URL overwrite.
- Strict Mode mount/cleanup, delayed observer, denied then manual location,
  renderer readiness, cancellation, unmount, and navigation during requests.
- New coordinate submit, sky-click resolution, detector repeat, size draft,
  empty results, network failure, Clear, inspector Close, and stale responses.
- Popstate valid/absent/invalid, listener cleanup, no URL feedback loops.
- Automatic/replayed onboarding never reads or alters shared search state.
- Clipboard success, missing/denied clipboard, manual fallback, accessible
  status, and English/Spanish strings.

Run frontend tests, lint, and production build. Perform a real-browser smoke
check at desktop and narrow widths, including opening a copied link in a fresh
browser context, keyboard copying, geolocation denial/manual recovery,
onboarding replay, and image focus once projection is ready.

Mocked lifecycle tests do not establish live IRSA availability or WebGL visual
correctness. No load benchmark or scientific suitability claim is required.

## Design workflow

- [x] Inspect current frontend and existing URL-design references.
- [x] Confirm celestial-region/search-settings scope.
- [x] Present approaches and obtain selection.
- [x] Write draft design.
- [x] Fresh builder check; reviewer reported "nothing important left".
- [ ] Obtain user approval of this design.
- [ ] Write the phased implementation plan (no product implementation yet).
