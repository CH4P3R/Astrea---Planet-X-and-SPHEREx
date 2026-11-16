# Shareable Sky Locations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a submitted celestial region and its search settings survive reload, bookmark, browser navigation, and a copied link, without sharing the observer’s location or any other session state.

**Architecture:** A pure URL module parses and serializes four allowlisted parameters. A small `useSkyUrl` hook owns initial classification, `history.replaceState`, and `popstate`; `useFitsImage` owns one committed search and emits it only for real commits. `AppViewport` checks the URL before deciding whether to auto-open onboarding, and the tutorial workspace never reads or writes normal URL state.

**Tech Stack:** React 19, Vite 8, JavaScript ESM, Node’s built-in test runner for pure logic, Vitest + jsdom + React Testing Library for executable component/lifecycle tests, existing i18n JSON catalogs.

**Spec:** `docs/superpowers/specs/2026-11-15-shareable-sky-locations-design.md`

## Global Constraints

- URL parameters are exactly `ra`, `dec`, `size`, `detector`, serialized in that order.
- Defaults: `size = 7` arcminutes, `detector = 0` (any detector).
- Valid ranges: `0 <= ra < 360`, `-90 <= dec <= 90`, `0.1 <= size <= 30`, integer `0 <= detector <= 6`.
- If any supported parameter is present, `ra` and `dec` are both required; any malformed supported parameter invalidates the whole search and sends no archive request.
- Duplicate supported keys, blank values, nonfinite values, hexadecimal notation, trailing junk, and out-of-range values are invalid. Decimal scientific notation is allowed.
- Unknown parameters, including historical `fov`, `collection`, and `speed`, are ignored. A URL with only unknown keys is ordinary startup.
- Only committed searches write the URL. Draft RA/Dec/size edits, camera motion, clock ticks, projection refreshes, and tutorial activity do not.
- Use `history.replaceState`, preserve `history.state`, origin, pathname, hash, and unrelated query parameters.
- Copied share links contain only the four allowlisted fields; they exclude unrelated query parameters and the hash.
- A valid or invalid link suppresses automatic onboarding for that visit without changing stored tour status. The tutorial workspace never reads, writes, clears, or shares normal URL state.
- No router, Zustand addition, backend change, short-link server, account system, camera-pose URL, image-ID persistence, or comparison-session persistence.
- English and Spanish strings stay key-for-key identical; existing Node i18n parity test must keep passing.
- No visual redesign and no new production dependency.

## Review Focus

- **Raw `+` in a query value decodes to a space.** A copied or hand-edited link must not turn `+5` into `5`; the parser rejects the decoded space and the serializer must percent-encode a literal plus. Tested in Task 1.
- **Duplicate supported keys.** `?ra=1&ra=2` is ambiguous; it must invalidate the search rather than let a last-wins parser pick a region. Tested in Task 1.
- **`history.replaceState` throwing.** Private browsing or quota errors must not break search; show a nonblocking warning and keep Copy link usable from committed data. Tested in Task 5.
- **Clipboard absent or denied.** A non-secure context or permission denial must reveal a selectable read-only link and never announce success. Tested in Task 7.
- **Stale responses and Strict Mode double effects.** An older search or load must not overwrite a newer region, and Strict Mode must leave exactly one active request rather than consuming an intent whose only request was aborted. Tested in Task 4.

---

### Task 1: Pure URL contract

**Files:**
- Create: `frontend/src/share/skyUrl.js`
- Test: `frontend/tests/skyUrl.test.mjs`

**Interfaces:**
- Consumes: `DEFAULT_CUTOUT_SIZE` and `ANY_DETECTOR` from `frontend/src/config/search.js`.
- Produces:
  - `SKY_PARAMETERS: readonly ['ra', 'dec', 'size', 'detector']`
  - `parseSkyUrl(href: string): { status: 'none' } | { status: 'invalid' } | { status: 'valid', search: { ra: number, dec: number, size: number, detector: number } }`
  - `serializeSkySearch(search): string` — URL-encoded query string without `?`, fields in contract order.
  - `buildShareUrl(href: string, search): string` — absolute URL with only the four fields, no hash.
  - `syncSkyUrl(href: string, search | null): string` — absolute URL with supported fields replaced or removed and all unrelated query/hash state preserved.

- [ ] **Step 1: Write the failing tests**

Cover at least these assertions in `frontend/tests/skyUrl.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildShareUrl, parseSkyUrl, serializeSkySearch, syncSkyUrl,
} from '../src/share/skyUrl.js'

const base = 'https://astrea.test/path'

test('round trips coordinates, defaults, poles, precision, and detectors', () => {
  const cases = [
    [{ ra: 0, dec: -90, size: 0.1, detector: 0 }, 'ra=0&dec=-90&size=0.1&detector=0'],
    [{ ra: 359.999999, dec: 90, size: 30, detector: 6 }, 'ra=359.999999&dec=90&size=30&detector=6'],
    [{ ra: 83.63, dec: -5.39, size: 12.5, detector: 3 }, 'ra=83.63&dec=-5.39&size=12.5&detector=3'],
  ]
  for (const [search, query] of cases) {
    assert.equal(serializeSkySearch(search), query)
    assert.deepEqual(parseSkyUrl(`${base}/?${query}`), { status: 'valid', search })
  }
  assert.deepEqual(parseSkyUrl(`${base}/?ra=1&dec=2`), {
    status: 'valid', search: { ra: 1, dec: 2, size: 7, detector: 0 },
  })
  assert.equal(serializeSkySearch({ ra: -0, dec: 1, size: 7, detector: 0 }), 'ra=0&dec=1&size=7&detector=0')
})

test('rejects malformed supported parameters without interpreting unknown ones', () => {
  for (const query of [
    'ra=&dec=1', 'ra=1', 'ra=1&dec=', 'size=7', 'detector=3',
    'ra=1&ra=2&dec=3', 'ra=1&dec=2&size=7&size=8', 'ra=0x10&dec=0',
    'ra=1abc&dec=0', 'ra=Infinity&dec=0', 'ra=1e999&dec=0',
    'ra=360&dec=0', 'ra=-1&dec=0', 'ra=1&dec=90.1', 'ra=1&dec=-90.1',
    'ra=1&dec=2&size=0', 'ra=1&dec=2&size=30.1',
    'ra=1&dec=2&detector=7', 'ra=1&dec=2&detector=-1', 'ra=1&dec=2&detector=1.5',
  ]) assert.deepEqual(parseSkyUrl(`${base}/?${query}`), { status: 'invalid' }, query)
  assert.deepEqual(parseSkyUrl(`${base}/?fov=1&collection=x&speed=2`), { status: 'none' })
  assert.deepEqual(parseSkyUrl(`${base}/?ra=1&dec=2&fov=5`), {
    status: 'valid', search: { ra: 1, dec: 2, size: 7, detector: 0 },
  })
  assert.deepEqual(parseSkyUrl(base), { status: 'none' })
})

test('preserves plus signs only when URL-encoded, and accepts scientific notation', () => {
  assert.deepEqual(parseSkyUrl(`${base}/?ra=%2B5&dec=%2B1&size=1e-1&detector=0`), {
    status: 'valid', search: { ra: 5, dec: 1, size: 0.1, detector: 0 },
  })
  assert.deepEqual(parseSkyUrl(`${base}/?ra=1e%2B2&dec=1e%2B1`), {
    status: 'valid', search: { ra: 100, dec: 10, size: 7, detector: 0 },
  })
  assert.deepEqual(parseSkyUrl(`${base}/?ra=+5&dec=1`), { status: 'invalid' })
})

test('share links drop unrelated query and hash; synchronization preserves them', () => {
  const href = `${base}/?foo=1&ra=1&dec=2&size=7&detector=0&bar=2#frag`
  assert.equal(buildShareUrl(href, { ra: 3, dec: 4, size: 5, detector: 6 }),
    `${base}/?ra=3&dec=4&size=5&detector=6`)
  assert.equal(syncSkyUrl(href, { ra: 3, dec: 4, size: 5, detector: 6 }),
    `${base}/?foo=1&bar=2&ra=3&dec=4&size=5&detector=6#frag`)
  assert.equal(syncSkyUrl(href, null), `${base}/?foo=1&bar=2#frag`)
})
```

- [ ] **Step 2: Run the tests to confirm failure**

Run: `cd frontend && node --test tests/skyUrl.test.mjs`
Expected: FAIL because `src/share/skyUrl.js` does not exist.

- [ ] **Step 3: Implement `frontend/src/share/skyUrl.js`**

Use a single decimal grammar for `ra`, `dec`, and `size`: `^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$`, followed by `Number.isFinite`. Use `^[+-]?\d+$` for `detector`, then `Number.isInteger` and range. Do not trim values: a raw `+` arrives as a space and must fail.

`parseSkyUrl` must inspect `new URL(href).searchParams`, count `getAll(key).length` for duplicate detection, return `none` when no supported key exists, and return `invalid` on the first failed rule. Normalize negative zero with `value === 0 ? 0 : value`. `serializeSkySearch` writes `String(value)` for each field and relies on `URLSearchParams` encoding. `syncSkyUrl` deletes each supported key, appends the serialized fields when a search is supplied, and leaves `url.hash` untouched.

- [ ] **Step 4: Run the tests to confirm pass**

Run: `cd frontend && node --test tests/skyUrl.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/share/skyUrl.js frontend/tests/skyUrl.test.mjs
git commit -m "feat: add shareable sky URL contract"
```

---

### Task 2: Executable React test harness

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.js`
- Create: `frontend/tests/react/setup.js`
- Create: `frontend/tests/react/harness.test.jsx`

**Interfaces:**
- Produces: `npm run test:react` for jsdom component tests; `npm test` runs the existing Node tests and then Vitest.

- [ ] **Step 1: Install test-only dependencies**

Run: `cd frontend && npm install --save-dev vitest jsdom @testing-library/react @testing-library/dom`

- [ ] **Step 2: Add Vitest configuration and setup**

`frontend/vitest.config.js`:

```js
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/react/**/*.test.{js,jsx}'],
    setupFiles: ['tests/react/setup.js'],
    restoreMocks: true,
  },
})
```

`frontend/tests/react/setup.js` must install minimal browser boundaries missing from jsdom:

```js
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

class ResizeObserver { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= ResizeObserver
window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
globalThis.requestAnimationFrame ??= (callback) => setTimeout(() => callback(Date.now()), 0)
globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id)

afterEach(() => {
  cleanup()
  try { window.history.replaceState({}, '', '/') } catch { /* a test may still have a throwing spy installed */ }
})
```

Update scripts in `frontend/package.json` to:

```json
"test": "npm run test:unit && npm run test:react",
"test:unit": "node --test",
"test:react": "vitest run"
```

- [ ] **Step 3: Write a smoke test**

`frontend/tests/react/harness.test.jsx` imports `it`/`expect` from `vitest` and `render`/`screen`/`fireEvent` from `@testing-library/react`, renders a tiny component, clicks it with `fireEvent`, and asserts the DOM update with `expect`. This proves jsdom, React 19, and Testing Library are wired before feature work. Later test files follow the same explicit-import style.

- [ ] **Step 4: Run the harness**

Run: `cd frontend && npm run test:react`
Expected: PASS.

- [ ] **Step 5: Confirm the existing suite still runs**

Run: `cd frontend && npm run test:unit`
Expected: existing 83 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.js frontend/tests/react/setup.js frontend/tests/react/harness.test.jsx
git commit -m "test: add executable React test harness"
```

---

### Task 3: Committed search model and controlled search form

**Files:**
- Modify: `frontend/src/hooks/useFitsImage.js`
- Modify: `frontend/src/components/controls/FitsControls.jsx`
- Modify: `frontend/src/components/controls/ContextToolbar.jsx`
- Modify: `frontend/src/components/layout/AppWorkspace.jsx`
- Test: `frontend/tests/react/fitsCommit.test.jsx`

**Interfaces:**
- Consumes: `searchImages`, `searchCoordinates` from `frontend/src/services/images.js`; URL helpers from Task 1 are not needed here.
- Produces this hook signature:

```js
useFitsImage(observer, timeContext, catalog = 'archive', {
  initialSearch = null,          // { ra, dec, size, detector } from a valid URL
  initialCoordinates = null,     // { ra, dec } for the tutorial form only
  onCommittedChange = () => {},  // called with SkySearch or null on user commits/clear only
} = {})
```

Adds these returns to the existing hook result:

```js
coordinates: { ra: string, dec: string }
setCoordinate(field: 'ra' | 'dec', value: string): void
committed: { ra, dec, size, detector } | null
commitPending: boolean
restore(search): void
applyUrl(state): void
```

- [ ] **Step 1: Write the failing commit tests**

`frontend/tests/react/fitsCommit.test.jsx` must mock `../../src/services/images.js` and `../../src/three/core/imageDataUtils.js`. Use a probe component that calls the real hook and exposes buttons for `searchByCoordinates`, `search`, `setDetector`, `setSize`, `reset`, and `applyUrl`.

Add tests with these exact expectations:

```js
it('commits a coordinate submit at dispatch and leaves drafts out of the URL', async () => {
  // searchCoordinates resolves { images: [], has_more: false, query: {...} }
  // click coordinates, then assert:
  expect(searchCoordinates).toHaveBeenCalledWith(83.63, -5.39, 7, 0, expect.any(AbortSignal), 'archive')
  expect(onCommittedChange).toHaveBeenLastCalledWith({ ra: 83.63, dec: -5.39, size: 7, detector: 0 })
  // click size12: only fits.size changes; onCommittedChange is not called again
})

it('waits for resolved sky coordinates before committing and keeps the previous commit on failure', async () => {
  // first commit 10/20; then click sky with a deferred searchImages promise
  // before resolution: commitPending true, committed still 10/20, no new callback
  // resolve with query { ra_deg: 30, dec_deg: 40, size_deg: 0.2 }
  // expect committed { ra: 30, dec: 40, size: 12, detector: 0 } when the draft size was 12
  // expect the RA/Dec inputs to now show 30 / 40 (resolved sky clicks update controls)
  // a second sky search that rejects leaves the 30/40 commit unchanged and clear commitPending
})

it('repeats the detector with the last committed size and commits the new filter', async () => {
  // commit 10/20 with size 7, then edit draft size to 20
  // click d3
  // expect searchCoordinates called with (10, 20, 7, 3, ...)
  // expect committed { ra: 10, dec: 20, size: 7, detector: 3 }
})

it('restores and clears without treating navigation as a user commit', () => {
  // applyUrl({ status: 'valid', search }) atomically sets inputs, size, detector, committed
  // applyUrl({ status: 'none' }) and { status: 'invalid' } clear committed
  // neither calls onCommittedChange
})

it('cancel preparation restores committed controls and reset clears the commit', () => {
  // edit RA/Dec/size after a commit, call cancelPreparation -> committed values return
  // call reset -> committed null, onCommittedChange(null), size draft preserved
})
```

Also render the real `FitsControls` inside an `I18nProvider` and assert that typing RA/Dec updates `fits.coordinates` and submitting calls `searchByCoordinates` with `Number` values. Assert that the tutorial path (`initialCoordinates`) still shows Barnard RA/Dec without a URL or automatic search.

- [ ] **Step 2: Run the tests to confirm failure**

Run: `cd frontend && npx vitest run tests/react/fitsCommit.test.jsx`
Expected: FAIL because `coordinates`, `committed`, `commitPending`, `restore`, and `applyUrl` do not exist.

- [ ] **Step 3: Implement the committed model in `useFitsImage`**

Required behavior:

- Initialize `size`, `detector`, `coordinates`, and `committed` from `initialSearch` atomically; otherwise use `initialCoordinates` for the form, `DEFAULT_CUTOUT_SIZE`, and `ANY_DETECTOR`.
- `searchByCoordinates(ra, dec)` validates with the existing `cutoutSizeError` and `coordinateError`, then commits `{ ra, dec, size, detector: ANY_DETECTOR }` before dispatching. Update the form to the submitted numbers. Keep detector 0 in the commit.
- `search(direction)` validates size and observer as today, sets `commitPending = true`, and dispatches the click search. Do not commit until a successful response. On success, commit `{ ra: result.query.ra_deg, dec: result.query.dec_deg, size: requestedSize, detector: requestedDetector }` after validating the pair; a failure or cancellation leaves the previous commit and sets `commitPending = false`.
- `setDetector(value)` repeats the committed region with the committed size when a commit exists; apply the new detector commit at dispatch and notify. Without a commit, preserve the old repeat behavior for the last search and do not notify.
- `setCoordinate` updates the draft and calls `beginPreparation`. Draft RA/Dec/size changes never notify.
- `applyUrl({ status: 'valid', search })` calls `restore(search)`; `restore` applies settings, sets `lastSearch`, and dispatches one search without notifying. `applyUrl` with `none` or `invalid` aborts/clears through `reset({ notify: false })`.
- `cancelPreparation` restores the committed RA/Dec/size when present, otherwise the initial draft.
- `reset()` clears `committed`, sets `commitPending = false`, notifies `null`, and keeps the existing size/detector/result reset behavior.
- Store `onCommittedChange` in a ref so callback identity changes do not create effects or stale closures.

- [ ] **Step 4: Convert `FitsControls` to controlled coordinates**

Remove its local `ra`/`dec` state and read `fits.coordinates`. Keep the local `validation` state. RA/Dec `onChange` clears validation and calls `fits.setCoordinate(field, value)`. Submit keeps the existing blank/coordinate validation and calls `fits.searchByCoordinates(Number(ra), Number(dec))`. Remove the now-unused `initialCoordinates` prop from `FitsControls` and `ContextToolbar`; `AppWorkspace` passes it to `useFitsImage` instead for the tutorial workspace.

- [ ] **Step 5: Run the commit and existing tests**

Run: `cd frontend && npx vitest run tests/react/fitsCommit.test.jsx`
Expected: PASS.

Run: `cd frontend && npm run test:unit`
Expected: existing tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useFitsImage.js frontend/src/components/controls/FitsControls.jsx frontend/src/components/controls/ContextToolbar.jsx frontend/src/components/layout/AppWorkspace.jsx frontend/tests/react/fitsCommit.test.jsx
git commit -m "feat: track one committed sky search"
```

---

### Task 4: Observer-delayed loading, cancellation, and stale-response guards

**Files:**
- Modify: `frontend/src/hooks/useFitsImage.js`
- Test: `frontend/tests/react/fitsLoading.test.jsx`

**Interfaces:**
- Consumes: the committed model from Task 3.
- Produces: no new public names; strengthens `applyUrl`, `search`, `searchByCoordinates`, `load`, `cancel`, and `reset` lifecycle behavior.

- [ ] **Step 1: Write the failing lifecycle tests**

Use a deferred-promise helper and mock `loadMetadata`, `loadPixels`, and `loadProjection`. A probe must call `fits.setTextureLimit(4096)` in an effect to simulate renderer readiness.

Add tests with these expectations:

```js
it('keeps results pending until observer and renderer are ready, then loads once', async () => {
  // observer null, texture limit set, coordinate search resolves with one image
  // expect loadMetadata not called
  // rerender with observer -> expect loadMetadata called once with the image id
  // rerender with a different observer later -> expect no second loadMetadata
})

it('does not retry a failed auto-load after an observer change', async () => {
  // pending result, observer arrives, loadMetadata rejects
  // rerender with another observer -> expect one loadMetadata call total
})

it('recovers from denied geolocation through manual location and loads once', async () => {
  // harness uses the real useObserver with automatic: true
  // set window.isSecureContext = true and stub navigator.geolocation
  // getCurrentPosition calls the error callback with code 1 (denied)
  // searchCoordinates resolves with one image; expect results retained and no load
  // click the harness's applyManualLocation(19.43, -99.13) button
  // expect one loadMetadata call and the observer source becomes 'manual'
})

it('cancels pending intent and obsolete work', async () => {
  // cancel while a search is in flight -> aborted signal, pending cleared, no load
  // unmount while loading -> signal aborted
})

it('ignores a stale search or load that resolves after a newer request', async () => {
  // start search A, then search B; resolve A after B
  // expect committed/results corresponding to B only
})

it('leaves exactly one non-aborted request under Strict Mode', async () => {
  // render the probe inside <StrictMode> with a deferred search
  // after effects settle: exactly one search signal is not aborted
  // resolve it and expect one committed state
})
```

- [ ] **Step 2: Run the tests to confirm failure**

Run: `cd frontend && npx vitest run tests/react/fitsLoading.test.jsx`
Expected: FAIL because results load immediately or pending intent is not tracked.

- [ ] **Step 3: Implement pending auto-load and guards**

- Replace the unconditional `await load(result.images[0].id)` in `runSearch` with a readiness check: load immediately only when `contextRef.current.observer` exists and `maxTextureSize.current > 0`; otherwise store `pendingLoad.current = { searchId, id }`.
- Add a `searchId` counter ref incremented at every search dispatch. Clear `pendingLoad.current` when a new search starts, on `cancel`, on `reset`, and on unmount.
- Add an effect keyed by `observer` and `textureLimit` that consumes a pending intent exactly once when both are ready and `pending.searchId === searchId.current`. Set `pendingLoad.current = null` before calling `load`. A failed load does not recreate the intent.
- Keep the existing AbortController checks after every await in `runSearch`, `load`, and `refine`. Ensure an aborted older search never calls the commit callback or replaces state.
- Initial URL hydration must dispatch once per mount. In Strict Mode, setup/cleanup/setup may abort the first attempt, so do not mark the initial intent consumed in a way that prevents the second attempt. The final result must be one non-aborted request.
- Do not require an observer for a coordinate search itself; only projection/loading waits for one. Preserve the existing “Location required” behavior for sky clicks.

- [ ] **Step 4: Run the lifecycle and commit tests**

Run: `cd frontend && npx vitest run tests/react/fitsLoading.test.jsx tests/react/fitsCommit.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useFitsImage.js frontend/tests/react/fitsLoading.test.jsx
git commit -m "feat: delay shared-search loading until observer is ready"
```

---

### Task 5: `useSkyUrl` synchronization hook

**Files:**
- Create: `frontend/src/share/useSkyUrl.js`
- Test: `frontend/tests/react/skyUrlHook.test.jsx`

**Interfaces:**
- Consumes: `parseSkyUrl`, `buildShareUrl`, `syncSkyUrl` from Task 1.
- Produces:

```js
useSkyUrl({ enabled = true, onRestore = () => {} } = {}): {
  initial: { status: 'none' | 'invalid' } | { status: 'valid', search },
  initialSearch: search | null,
  warning: '' | 'share.notices.invalid' | 'share.notices.history',
  sync(search | null): void,
  shareHref(search): string,
}
```

- [ ] **Step 1: Write the failing hook tests**

Wrap the hook in a probe that renders `initial.status`, `initialSearch`, `warning`, and buttons that call `sync` and `shareHref`. Add tests with these expectations:

```js
it('classifies the initial URL once and exposes a valid search', () => {
  window.history.replaceState({}, '', '/?ra=83.63&dec=-5.39&size=12&detector=3')
  // initial valid; initialSearch deep-equals the parsed values; warning ''
  window.history.replaceState({}, '', '/?ra=bad')
  // a fresh mount has initial invalid; initialSearch null; warning 'share.notices.invalid'
})

it('synchronizes without losing unrelated query, hash, or history state', () => {
  window.history.replaceState({ keep: 1 }, '', '/?foo=1#frag')
  // sync(search) -> /?foo=1&ra=...&dec=...&size=...&detector=...#frag
  // history.state still { keep: 1 }
  // syncing the same search again does not call replaceState a second time
  // shareHref(search) returns only the four fields and no hash
})

it('keeps the search usable and warns when replaceState throws', () => {
  // spy history.replaceState to throw
  // sync(search) does not throw; warning becomes 'share.notices.history'
})

it('handles valid, absent, and invalid popstate and removes its listener', () => {
  // onRestore receives { status: 'valid', search }, { status: 'none' }, { status: 'invalid' }
  // invalid sets the invalid warning
  // a valid restore followed by sync(same) creates no history feedback loop
  // unmount, dispatch popstate -> onRestore call count does not change
})

it('does nothing when disabled for the tutorial', () => {
  // enabled: false -> no initial parse, no listener, sync() does not call replaceState
})
```

- [ ] **Step 2: Run the tests to confirm failure**

Run: `cd frontend && npx vitest run tests/react/skyUrlHook.test.jsx`
Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement `useSkyUrl`**

- Capture the initial classification in a lazy `useState` initializer using `window.location.href`.
- Initialize `warning` to `share.notices.invalid` for an invalid initial URL.
- Keep `onRestore` in a ref so the listener effect has stable dependencies.
- Add one `popstate` listener when enabled. Re-parse the current URL, clear the invalid warning for valid/absent entries, set it for invalid entries, then call `onRestore(classification)`.
- `sync(search)` builds `syncSkyUrl(window.location.href, search)`. If the result equals the current href, only clear the warning. Otherwise call `window.history.replaceState(window.history.state, '', next)` inside `try/catch`; on success clear the warning, on failure set `share.notices.history` and return without throwing.
- `shareHref(search)` returns `buildShareUrl(window.location.href, search)` or `''` when search is null.
- Disabled mode is a no-op for reads, writes, and listeners.

- [ ] **Step 4: Run the hook tests**

Run: `cd frontend && npx vitest run tests/react/skyUrlHook.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/share/useSkyUrl.js frontend/tests/react/skyUrlHook.test.jsx
git commit -m "feat: synchronize committed sky searches with the URL"
```

---

### Task 6: Startup precedence, workspace wiring, and warning strings

**Files:**
- Create: `frontend/src/share/startup.js`
- Modify: `frontend/src/components/layout/AppViewport.jsx`
- Modify: `frontend/src/components/layout/AppWorkspace.jsx`
- Modify: `frontend/src/components/controls/ContextToolbar.jsx`
- Modify: `frontend/src/components/controls/FitsControls.jsx`
- Modify: `frontend/src/i18n/resources.js`
- Create: `frontend/src/i18n/locales/en/share.json`
- Create: `frontend/src/i18n/locales/es/share.json`
- Modify: `frontend/tests/i18n.test.mjs`
- Test: `frontend/tests/react/startup.test.jsx`
- Test: `frontend/tests/react/workspace.test.jsx`

**Interfaces:**
- Consumes: `parseSkyUrl`, `useSkyUrl`, and the committed hook API.
- Produces: `initialTourOpen(href: string, storage): boolean`, which returns `false` for any URL with supported parameters (valid or invalid), otherwise delegates to `shouldStartTour`.

- [ ] **Step 1: Write the startup tests**

`frontend/tests/react/startup.test.jsx` tests both the pure helper and `AppViewport`:

```js
it('suppresses automatic onboarding for valid and invalid shared links without storing a status', () => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const base = 'https://astrea.test'
  expect(initialTourOpen(`${base}/?ra=1&dec=2`, storage)).toBe(false)
  expect(initialTourOpen(`${base}/?ra=bad`, storage)).toBe(false)
  expect(values.size).toBe(0)
  expect(initialTourOpen(`${base}/`, storage)).toBe(true)
})

it('renders the normal workspace without the tutorial and can still replay it', () => {
  // vi.mock AppWorkspace: normal renders a "start tour" button calling onStartTour,
  // tutorial renders "tutorial workspace"
  // valid shared URL -> tutorial absent, start button present
  // click start -> tutorial appears even though the shared URL suppressed auto-start
  // finish/replay round trip -> normal workspace mount count is still 1 and the
  // shared search is not hydrated again
})
```

- [ ] **Step 2: Write the workspace integration tests**

`frontend/tests/react/workspace.test.jsx` renders the real `AppWorkspace` inside `I18nProvider`, with these boundaries mocked with Vitest: `@react-three/fiber` (`Canvas` renders children), `SkyScene.jsx` (calls `fits.setTextureLimit(4096)` in an effect and renders a sky-click button), `useObserver` (ready observer), `useSkyClock` (paused fixed time), `useStars`, `useImageViewport`, `useImageComparison`, `useComparisonPresentation`, `useProjectedImage`, and `services/images.js`. Mock `imageDataUtils` to avoid binary decoding.

Add tests with these expectations:

```js
it('hydrates a shared URL atomically and does not overwrite it with defaults', async () => {
  window.history.replaceState({}, '', '/?ra=83.63&dec=-5.39&size=12&detector=3&foo=1#frag')
  // render; await the search
  // searchCoordinates called once with (83.63, -5.39, 12, 3, signal, 'archive')
  // RA/Dec/size inputs show 83.63 / -5.39 / 12
  // history.replaceState was not called with a default-only URL
  // unrelated foo and hash remain
})

it('opens the search panel for an invalid cold link without sending a request', async () => {
  window.history.replaceState({}, '', '/?ra=bad&foo=1#frag')
  // render; await effects
  // searchCoordinates and searchImages were not called
  // the invalid warning is visible and the search panel is open
  // the malformed ra value and unrelated foo/hash remain in the URL
  // click Clear -> ra disappears, unrelated foo/hash remain
})

it('updates the URL on a new coordinate submit and on Clear', async () => {
  // edit RA/Dec, submit -> URL has the four fields
  // click Clear -> four fields removed, unrelated foo/hash preserved
})

it('does not commit a sky click until the backend resolves coordinates', async () => {
  // click the mocked sky button; searchImages deferred
  // URL still has no ra/dec and the committed search is unchanged
  // resolve with query { ra_deg, dec_deg, size_deg }; URL gains the resolved fields
  // the disabled Copy link behavior for this pending state is asserted in Task 7
})

it('restores valid popstate entries, clears absent ones, and rejects invalid ones', async () => {
  // pushState + dispatch popstate for each case
  // valid: one new search and updated inputs; no replaceState feedback loop
  // valid navigation while search A is in flight: A is aborted and a late A response is ignored
  // absent: search state cleared, no onboarding
  // invalid: no new request, warning visible, malformed URL preserved
})

it('removes URL fields when the inspector closes', async () => {
  // load a result so the inspector opens; click Close
  // four supported fields removed
})

it('shows a synchronization warning when history mutation throws but keeps the commit', async () => {
  // spy history.replaceState to throw
  // submit valid coordinates; search still runs and committed state exists
  // the history warning is visible in the global status region
  // the committed search is still present for the Copy link control added in Task 7
})
```

- [ ] **Step 3: Run the tests to confirm failure**

Run: `cd frontend && npx vitest run tests/react/startup.test.jsx tests/react/workspace.test.jsx`
Expected: FAIL because startup and workspace wiring do not exist.

- [ ] **Step 4: Implement startup and wiring**

- `startup.js` calls `parseSkyUrl(href)` inside `try/catch`; any status other than `none` returns `false`, and a parse failure falls through to ordinary startup. Otherwise return `shouldStartTour(storage)`. Keep the existing storage-failure fallback of `true`.
- `AppViewport` initializes `tourOpen` with `initialTourOpen(window.location.href, storage)`, guarding the `window.localStorage` getter. Do not write tour status for shared links. Keep `startTour` available for replay.
- In `AppWorkspace`, call `useSkyUrl({ enabled: !tutorial, onRestore })` before `useFitsImage`. Use a ref for `fits.applyUrl` so the popstate callback can be stable. Pass `initialSearch: skyUrl.initialSearch` and `onCommittedChange: skyUrl.sync` for the normal workspace; for the tutorial pass `initialCoordinates: { ra: barnardQuery.ra_deg, dec: barnardQuery.dec_deg }` and no URL callbacks.
- Add an effect that opens the search panel whenever `skyUrl.warning === 'share.notices.invalid'`, covering initial invalid links and invalid popstate entries.
- Pass `warning={skyUrl.warning}` through `ContextToolbar` to `FitsControls`. Render the invalid-link warning as a nonblocking `role="status"` paragraph in the search panel. Keep it visible until a successful sync clears it.
- Make Clear available on an invalid cold link even though the search state is idle: include `warning === 'share.notices.invalid'` in the Clear button condition in `FitsControls`. Clear calls `fits.reset()`, which removes the four parameters through `sync(null)` and leaves unrelated query/hash state intact.
- Sharing controls are added in Task 7; do not destructure an unused `share` prop here.
- Render `share.notices.history` in the existing global `StatusNotice` region so a failed write is visible even when the search panel is closed (for example, after inspector Close): use a `useMemo`-stabilized `{ status: 'error', message: skyUrl.warning }` only for that warning, otherwise keep the existing `starsNotice ?? fits.notice` priority. `StatusNotice` compares notices by identity during render, so an inline object would re-render indefinitely. Invalid-link warnings stay in the search panel to avoid duplicate announcements.
- Do not show sharing controls in the tutorial.
- Keep the normal workspace mounted while the tutorial opens and closes; only the tutorial workspace mounts/unmounts. This is what prevents a replay from hydrating the shared URL again.

- [ ] **Step 5: Add localized strings**

Create `share.json` in both locales with identical keys:

```json
{
  "actions": { "copy": "Copy link" },
  "notices": {
    "copied": "Link copied",
    "manual": "Copy this link manually.",
    "invalid": "This shared link has invalid search settings. Correct the coordinates or clear the search.",
    "history": "The address bar could not be updated, but the search still works."
  },
  "fallback": { "label": "Share link" }
}
```

Spanish values: `Copiar enlace`, `Enlace copiado`, `Copia este enlace manualmente.`, `Este enlace compartido tiene ajustes de búsqueda no válidos. Corrige las coordenadas o limpia la búsqueda.`, `No se pudo actualizar la barra de direcciones, pero la búsqueda sigue funcionando.`, `Enlace para compartir`.

Register both catalogs in `resources.js`. Add assertions to `tests/i18n.test.mjs` that English and Spanish return the expected copy and warning strings; the existing parity test covers key equality.

- [ ] **Step 6: Run startup, workspace, and i18n tests**

Run: `cd frontend && npx vitest run tests/react/startup.test.jsx tests/react/workspace.test.jsx`
Expected: PASS.

Run: `cd frontend && node --test tests/i18n.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/share/startup.js frontend/src/components/layout/AppViewport.jsx frontend/src/components/layout/AppWorkspace.jsx frontend/src/components/controls/ContextToolbar.jsx frontend/src/components/controls/FitsControls.jsx frontend/src/i18n/resources.js frontend/src/i18n/locales/en/share.json frontend/src/i18n/locales/es/share.json frontend/tests/i18n.test.mjs frontend/tests/react/startup.test.jsx frontend/tests/react/workspace.test.jsx
git commit -m "feat: restore shared searches from the URL"
```

---

### Task 7: Copy link control and placement

**Files:**
- Create: `frontend/src/share/ShareLink.jsx`
- Create: `frontend/src/styles/components/share.css`
- Modify: `frontend/src/components/controls/ContextToolbar.jsx`
- Modify: `frontend/src/components/controls/FitsControls.jsx`
- Modify: `frontend/src/components/layout/ImageInspector.jsx`
- Modify: `frontend/src/components/layout/AppWorkspace.jsx`
- Test: `frontend/tests/react/shareLink.test.jsx`

**Interfaces:**
- Consumes: the `share = { getHref(): string, disabled: boolean } | null` object that `AppWorkspace` constructs in this task, plus the `share.*` strings from Task 6.
- Produces: a native-button `ShareLink` used in both the search-panel footer and the inspector summary.

- [ ] **Step 1: Write the failing ShareLink tests**

Every render goes inside `I18nProvider` because `ShareLink` calls `useTranslation`. Save and restore the original `navigator.clipboard` property descriptor in each test (or in `afterEach`) so a missing-clipboard test cannot leak into the next test.

```jsx
it('copies the freshly built share link and announces success', async () => {
  const writeText = vi.fn().mockResolvedValue()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  // render <ShareLink getHref={() => 'https://astrea.test/?ra=1&dec=2&size=7&detector=0'} disabled={false} />
  // focus and click the native "Copy link" button
  // expect writeText called with the href
  // expect role=status text "Link copied" and focus still on the button
})

it('reveals a labeled read-only link when the clipboard is missing or denied', async () => {
  // missing: delete navigator.clipboard
  // denied: writeText rejects
  // expect no success message; expect getByLabelText('Share link') to have value href and readOnly
  // focus the input and expect activeElement to be the input
})

it('does not copy while disabled or when the href is empty', () => {
  // disabled or null href -> no writeText, no status
})
```

- [ ] **Step 2: Run the tests to confirm failure**

Run: `cd frontend && npx vitest run tests/react/shareLink.test.jsx`
Expected: FAIL because `ShareLink.jsx` does not exist.

- [ ] **Step 3: Implement `ShareLink`**

- Use a native `<button type="button" disabled={disabled}>` with `t('share.actions.copy')`.
- On click, compute `href = getHref()`. If disabled or empty, return.
- `try { await navigator.clipboard.writeText(href) }`; only after resolution set status to `share.notices.copied` and render it in a `role="status" aria-live="polite"` element.
- On a missing API or rejection, set status to `share.notices.manual` and render a labeled read-only `<input value={href} onFocus={(event) => event.target.select()} />`. Do not focus it automatically; never announce success.
- Import `../../styles/components/share.css`. Use existing fonts, colors, and focus conventions; add only layout for the fallback and status. No modal or new icon library.

- [ ] **Step 4: Place the control**

- `ContextToolbar` accepts `share` and passes it to `FitsControls`.
- `FitsControls` footer: render `<ShareLink {...share} />` after the existing Search/Clear controls when `share` is present. It must stay enabled for empty or failed searches because those have a committed search.
- `ImageInspector` accepts and renders `<ShareLink {...share} />` after the observation/detector/release identity block when `share` is present. Do not feed detector metadata into the share object.
- `AppWorkspace` passes `share={tutorial ? null : { getHref: () => skyUrl.shareHref(fits.committed), disabled: !fits.committed || fits.commitPending }}` to both `ContextToolbar` and `ImageInspector`, and passes `null` in the tutorial.
- Add placement assertions to `tests/react/workspace.test.jsx`: the copy button appears in the search footer and in the inspector summary after a successful load, does not appear in the tutorial, stays enabled for an empty or failed search with a commit, is disabled while a sky click is unresolved, and remains enabled after a `history.replaceState` failure because the committed search is intact.

- [ ] **Step 5: Run the share and workspace tests**

Run: `cd frontend && npx vitest run tests/react/shareLink.test.jsx tests/react/workspace.test.jsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/share/ShareLink.jsx frontend/src/styles/components/share.css frontend/src/components/controls/ContextToolbar.jsx frontend/src/components/controls/FitsControls.jsx frontend/src/components/layout/ImageInspector.jsx frontend/src/components/layout/AppWorkspace.jsx frontend/tests/react/shareLink.test.jsx frontend/tests/react/workspace.test.jsx
git commit -m "feat: add Copy link for committed sky searches"
```

---

### Task 8: Full verification and smoke check

**Files:**
- No product code changes expected.

The design checklist already records approval and plan creation.

- [ ] **Step 1: Run all automated checks**

Run: `cd frontend && npm test`
Expected: all Node tests and all Vitest tests pass.

Run: `cd frontend && npm run lint`
Expected: 0 errors.

Run: `cd frontend && npm run build`
Expected: build succeeds. The existing large-chunk warning is acceptable.

- [ ] **Step 2: Perform the browser smoke check**

Start the backend using the workflow in `backend/environment.md`, then `cd frontend && npm run dev`. At desktop and a narrow width:

- Open a copied link in a fresh browser context. Confirm the search runs once with the supplied size and detector, the fields match, and no onboarding appears.
- Deny geolocation, confirm the results remain and the location controls are offered; apply a manual location and confirm the image loads and focuses once.
- Replay the tour, confirm it opens and closing it does not re-run the initial shared search or alter the URL.
- Clear the search and close the inspector; confirm all four parameters disappear while unrelated query/hash state remains.
- Copy from the search footer and inspector summary; test keyboard activation and a denied clipboard, confirming the manual fallback.

Record any environment-specific failure (WebGL, live IRSA, geolocation, clipboard) in the final report rather than claiming it passed.
