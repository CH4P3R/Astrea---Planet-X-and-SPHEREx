# Astrea codebase review

## Review scope and progress

- Review date: 2026-11-15.
- Branch: `jeffrey`.
- Reviewed revision: `bd77aeb`.
- Application code and dependencies were not modified during this review.
- Findings describe this revision, not a guarantee about subsequent changes.

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Inventory, documentation, and baseline checks | Complete |
| 2 | Correctness and security | Complete (scoped review; limits below) |
| 3 | Performance and maintainability | Complete (offline review; limits below) |
| 4 | Consolidated priorities and remaining work | Complete (triage and handoff; no fixes) |

## Phase 1 — Inventory and baseline

### Summary

Astrea is a working prototype, not the early scaffold described in the root
README. Release readiness has not been established.

Implemented areas found during inventory:

- FastAPI image discovery, FITS loading, caching, optional processing, and WCS projection.
- React/Three.js sky viewer with observer location and time controls.
- Multi-observation comparison and blink playback.
- English/Spanish translations and onboarding using bundled real FITS data.

### Verification performed

Commands run from the indicated directories:

| Directory | Command | Result |
| --- | --- | --- |
| `backend/` | `.venv/bin/python -m pytest tests -q` | 222 passed, 6 failed, 1 warning |
| `frontend/` | `npm test` | 83 passed |
| `frontend/` | `npm run lint` | Passed |
| `frontend/` | `npm run build` | Passed with a chunk-size warning |

Frontend dependencies were installed using
`npm ci --ignore-scripts --no-audit --no-fund`. No dependency vulnerability
audit was performed. Runtime versions were Node.js 24.19.0, npm 12.2.2, and
Python 3.13.5.

### Confirmed findings

#### F1 — Duplicate test helper prevents recrop verification

- **Evidence:** `backend/tests/test_images_api.py:89` defines
  `post(app, path, body)`, but line 302 redefines it as
  `post(app, path, **kwargs)`.
- **Impact:** the later definition overrides the earlier one. Five recrop test
  cases fail with `TypeError` before calling the endpoint.
- **Follow-up:** consolidate the helper and its callers, then rerun the tests.
  These failures do not establish that the recrop endpoint itself is broken.
- **Status:** Open; no fix applied.

#### F2 — OpenAPI route assertion is stale

- **Evidence:** the exact route-set assertion at
  `backend/tests/test_images_api.py:288` omits:
  - `/api/v1/images/onboarding`
  - `/api/v1/images/onboarding/{image_id}/fits`
  - `/api/v1/images/{image_id}/recrop`
- **Impact:** the OpenAPI test fails against the implemented route set.
- **Follow-up:** reconcile the expected API contract with the implemented routes.
- **Status:** Open; no fix applied.

#### F3 — Documentation contradicts the implementation and baseline

- **Evidence:**
  - `README.md:16` says no API endpoints exist.
  - `README.md:43`–44 describes a dependencies-only backend and starter frontend.
  - `README.md:70` says there is no server to start.
  - `frontend/README.md:218`–221 describes an older comparison workflow and limits
    than `frontend/docs/COMPARISON.md`.
  - `backend/environment.md:220` records an all-tests-passing result, but the
    current baseline has six failures.
- **Impact:** onboarding and feature-readiness claims are unreliable for the
  reviewed revision. The historical passing result does not describe today's baseline.
- **Follow-up:** update the entry-point documentation and reconcile comparison
  documentation with the verified implementation.
- **Status:** Open; no documentation corrections applied as part of the review.

#### F4 — No tracked CI workflow found

- **Evidence:** repository inventory found no tracked `.github/` workflow or
  other CI configuration.
- **Impact:** no repository-defined automated gate was found for tests, lint,
  and production builds. External CI configuration was not inspected.
- **Follow-up:** consider adding an automated verification gate.
- **Status:** Open.

### Remaining work recorded in the existing backlog

Source: `docs/sdd/backend/tasks.md`. These are documented pending items, not
independently verified implementation gaps.

- **3.3:** joint frontend/backend integration acceptance, including WCS placement,
  shared scaling, playback, and loading/error states.
- **4.4:** live acceptance-target validation and offline-demo acceptance.
  Cache warming alone does not establish offline browser discovery.
- **Phase 5:** pagination, spectra, cache eviction and disk quotas, multi-worker
  safety, Gaia/WISE overlays, remaining configurable constants, box-overlap
  search, optional difference analysis, and broader observation discovery.

Later-roadmap features are not automatically blockers for the prototype.

### Performance lead for Phase 3

The production build emitted a JavaScript chunk of 1,365.35 kB
(390.08 kB gzip), triggering Vite's warning for chunks above 500 kB.

This warrants measuring startup and loading behavior. The warning alone does
not prove poor runtime performance or justify a specific optimization.

### Limits and next step

Not yet verified:

- Live IRSA access and scientific acceptance targets.
- Browser integration, WebGL behavior, and the manual comparison test page.
- Security boundaries, dependency vulnerabilities, and production deployment.
- Runtime performance, memory use, and multi-worker behavior.

Passing unit tests and a successful build do not establish release readiness.
Phase 2 should inspect correctness and security, beginning with image loading,
cache boundaries, and frontend/backend contracts.

## Phase 2 — Correctness and security

### Review checklist

- [x] Inspect request schemas, image/cache services, and error translation.
- [x] Exercise recrop directly, bypassing the broken test helper.
- [x] Check frontend dependency advisories and backend dependency consistency.
- [x] Complete frontend request/state and archive-network reviews.
- [x] Verify suspected issues and record confirmed findings and limits.

### Checks performed so far

- Direct offline ASGI requests using the existing `FakeArchive`: a valid recrop
  returned 200 and loaded the original and cropped windows; sizes `0`, `-1`,
  `0.51`, and `"invalid"` all returned 422. Repository test code was not changed.
- Twenty searches differing only in valid cutout size persisted twenty distinct
  selection files in a temporary cache. No additional FITS downloads were needed.
- `npm audit --json`: zero reported vulnerabilities in the installed dependency
  tree at review time. This is an advisory check, not proof of vulnerability-free code.
- Backend `.venv/bin/python -m pip check`: no broken requirements. This checks
  package compatibility, not known vulnerabilities; a Python advisory scan has
  not been performed.
- Targeted backend regression run covering configuration, box geometry, FITS
  decoding, onboarding, extra planes, cache warming, and sky calculations:
  **79 passed, 1 warning**.
- Archive/range/sky regression run: **77 passed**. This overlaps the sky tests
  above; the two counts must not be added as unique tests.
- Independent archive-network review plus local HTTP and synthetic-error
  reproductions confirmed F6–F8 below. No external archive requests were made.
- Frontend diagnostic rerun:
  `node /tmp/opencode/astrea-projection-review-repro.mjs` confirmed F9 and F10
  using the actual hook modules, a deterministic hook dispatcher, fake clock,
  and mocked fetch. This temporary review harness is not a committed regression
  test or a substitute for browser acceptance.

### Confirmed findings

#### F5 — Truncated pixel caches are accepted as complete

- **Severity:** Medium (correctness and offline acceptance).
- **Evidence:** `backend/app/integrations/cutout_store.py:58`–69 checks that a
  binary file exists and its JSON description parses, but does not validate the
  binary's length. `backend/app/warm.py:92`–104 counts `service.pixels()` returning
  a path as a successful load.
- **Offline reproduction:** load both bundled onboarding observations into a
  temporary cache, truncate each `pixels.bin` to zero bytes, and call
  `verify_offline` with the two IDs and dates. The result is
  `OK ... 2/2 ready ... cached 2 ... failed 0`, while both files remain empty.
- **Impact:** a damaged/restored cache can pass demo readiness checks and keep
  serving unusable image data without attempting recovery. This reproduction
  does not show that normal atomic cache writes produce truncated files.
  A direct ASGI check also returned HTTP 200 with zero bytes for an image whose
  metadata requires 18,496 bytes.
- **Suggested follow-up:** validate cached binary lengths against dimensions
  and dtype before treating an image or plane as complete; handle invalid
  entries as a cache miss or an explicit cache error. Test both the serving
  path and offline verification.
- **Status:** Open; no fix applied.

#### F6 — Slow response bodies can exceed the absolute download budget

- **Severity:** Medium (availability).
- **Evidence:** `backend/app/integrations/irsa_ranges.py:58`–76 and
  `backend/app/integrations/irsa.py:406`–423 check elapsed time only after
  `iter_content(65536)` yields a chunk. The Requests read timeout bounds
  inactivity, not total elapsed time while a chunk is being filled.
- **Local reproduction:** a loopback HTTP server returned a 30-byte partial
  response one byte every 10 ms. `_request_once` with a 50 ms deadline raised
  its timeout only after approximately 300 ms. A separate reviewer reproduced
  the same behavior with a longer trickling response.
- **Impact:** a slow or malfunctioning upstream can hold synchronous workers
  longer than the configured budget. The same buffering pattern exists in
  the fallback downloader.
- **Suggested follow-up:** enforce a total deadline through transport/body
  reads, not merely between completed chunks; cover a trickling body in tests.
- **Status:** Open; no fix applied.

#### F7 — Stream read timeouts are retried and mapped to the wrong error

- **Severity:** Medium (correctness and availability).
- **Evidence:** `backend/app/integrations/http_retry.py:33`–38 excludes
  `requests.Timeout` but retries all `requests.ConnectionError` instances.
  Requests can wrap streamed-body `urllib3.exceptions.ReadTimeoutError` in a
  `ConnectionError`. `backend/app/integrations/irsa.py:387`–395 and 426–431
  then translate that wrapper to `ArchiveError` rather than `ArchiveTimeout`.
- **Offline reproduction:** constructing
  `requests.ConnectionError(ReadTimeoutError(None, "/", "timed out"))` made
  `is_transient` return `True`; `with_retries` attempted the action three times
  with retry waits bypassed for the diagnostic. Passing the same exception
  through `IrsaClient._partial` produced `ArchiveError`, not `ArchiveTimeout`.
  The integration reviewer also reproduced the wrapper using a stalled local
  HTTP response.
- **Impact:** body read timeouts can be retried contrary to the stated policy,
  and the existing error mapping returns 502 instead of the intended 504.
  Overall deadlines may limit retries but do not correct classification.
- **Suggested follow-up:** consistently recognize wrapped read timeouts in
  retry classification and error translation, while preserving retries for
  genuine transient connection failures.
- **Status:** Open; no fix applied.

#### F8 — Compressed FITS descriptors can bypass range-download size bounds

- **Severity:** Medium (upstream-data hardening and resource exhaustion).
- **Evidence:** `backend/app/integrations/irsa_ranges.py:248`–256 derives a
  heap read directly from tile counts and offsets without checking the heap,
  extension, or known file bounds. Lines 188–189 derive the allowed response
  size from that same range instead of an independent absolute cap.
- **Offline reproduction:** a synthetic one-row compressed table with tile
  descriptor `(count=2147483647, offset=0)`, `PCOUNT=1`, data offset 2880,
  and known file size 10,000 generated range `2888-2147486534` with an allowed
  response size of **2,147,488,255 bytes** for a one-pixel window.
  The request was intercepted before any network call or large allocation.
- **Impact:** a malformed archive response can authorize gigabytes of
  buffering despite a tiny requested cutout. The later decoded-image pixel
  cap does not protect this earlier stage. This is not a demonstrated
  user-controlled SSRF or arbitrary-file read.
- **Suggested follow-up:** validate descriptor counts and offsets against
  `PCOUNT`, `THEAP`, extension/file bounds, and an independent byte/allocation
  ceiling before issuing reads or reconstructing compressed data.
- **Status:** Open; no fix applied. Actual memory exhaustion was not attempted.

#### F9 — A live projection refresh can pause blink until manually restarted

- **Severity:** Medium (core comparison workflow).
- **Evidence:** `frontend/src/hooks/useProjectedImages.js:93`–97 and
  `frontend/src/hooks/useProjectedImage.js:15`–16 check readiness using the
  supplied HUD timestamp. `frontend/src/hooks/useSkyClock.js:8` updates that
  timestamp only once per second. Fresh live windows start at the projection
  request time, which can be later than the last HUD update.
  `frontend/src/hooks/useComparisonPresentation.js:18`–21 converts the brief
  readiness failure into disabled playback, and
  `frontend/src/hooks/useBlinkPlayback.js:9`–10 clears the playing state.
- **Reproduction:** start live blink with two observations; let a scheduled
  projection refresh finish between HUD updates, before the next clock tick.
  A deterministic offline hook execution by the frontend reviewer produced
  `ready=false`, position-not-ready reason, and `playing=false`; after the next
  tick, readiness recovered but playback stayed paused.
- **Impact:** an otherwise valid projection refresh can unexpectedly stop
  playback. This is a timing-dependent pause, not permanent inability to play:
  the user can restart it.
- **Suggested follow-up:** use current wall-clock time for live readiness in
  both projection hooks, matching the live renderer's `Date.now()` check in
  `frontend/src/three/elements/FitsImage.jsx:69`–70. Preserve the supplied
  timestamp for paused mode and regression-test the refresh/tick ordering.
- **Status:** Open; no fix applied. Code trace reviewed; not exercised in a
  real browser.

#### F10 — Single-image refresh can outlive the projection's remaining window

- **Severity:** Medium (projection lifecycle and framing).
- **Evidence:** `frontend/src/hooks/useProjectedImage.js:31`–36 schedules
  live refresh after a fixed 90 seconds, regardless of how much time the
  projection has left. `frontend/src/hooks/useFitsImage.js:73`–75 loads pixels
  and projection in parallel, so a fast projection can be nearly expired when
  a slow pixel response completes.
- **Reproduction:** provide a seed projection with five seconds remaining.
  Offline execution of the actual hook by the frontend reviewer scheduled
  refresh 90 seconds later. After six seconds, readiness was false, no refresh
  request had started, and the scheduled refresh was still 84 seconds away.
- **Impact:** `frontend/src/components/layout/AppWorkspace.jsx:51`–60 can lose
  its base-image framing input during the gap. An expiring detail projection
  can also cause an unnecessary fallback to the base image. The multi-image
  hook has its own lifetime-aware refresh, so this is not evidence that all
  rendered layers necessarily disappear.
- **Suggested follow-up:** schedule from the final sample time minus current
  time and a safety margin, refreshing promptly when inside that margin.
  `frontend/src/hooks/useProjectedImages.js:38`–42 already uses this pattern.
- **Status:** Open; no fix applied. Code trace reviewed; not exercised in a
  real browser.

### Public-deployment risk — Unbounded persistent cache growth

- **Evidence:** `backend/app/services/images.py:83`–93 includes exact request
  geometry in each image ID and persists every returned selection.
  `backend/app/integrations/cutout_store.py:27`–48 has no quota or eviction.
  No application-level request throttling was found.
- **Offline reproduction:** twenty valid searches against `FakeArchive`,
  differing only in cutout size, produced twenty new selection files without
  downloading FITS.
- **Impact:** repeated public requests can accumulate persistent files; loading
  the resulting IDs also accumulates pixel data. Disk exhaustion can make
  unrelated cache writes fail. Exploit throughput and external deployment
  protections were not measured.
- **Follow-up:** before unrestricted public exposure, establish disk/inode
  limits and request/concurrency controls, whether in the application or its
  deployment. Cache eviction and quotas are already backlog task **5.3**.
- **Scope note:** quotas and multi-worker operation are explicitly outside the
  current prototype requirements. This is a deployment-readiness risk, not a
  claim that the prototype violates those scope decisions.
- **Status:** Confirmed storage-growth behavior; deployment mitigation unknown.

### Phase 2 conclusion and limits

Six additional medium-severity correctness/availability findings were confirmed
(F5–F10), plus the deployment-scoped persistent-storage risk. No application
fixes were applied.

Suggested triage order, not an implementation plan:

1. Restore the baseline test gate (F1–F2) so future changes have reliable feedback.
2. Address core blink interruption (F9) and malformed-descriptor resource bounds (F8).
3. Correct download deadline and timeout behavior (F6–F7).
4. Correct near-expiry scheduling (F10) and cache/offline integrity checks (F5).
5. Establish storage and traffic safeguards before unrestricted public exposure.

Positive controls found: image IDs are restricted to 64 hexadecimal characters;
request models reject extra fields and nonfinite numbers in the inspected
inputs; target YAML uses safe loading; archive downloads use URL allowlisting
and refuse redirects. No user-controlled SSRF bypass was identified in this
scoped review. These observations do not establish that the application is secure.

Still unverified: real-browser/WebGL execution and manual acceptance, live IRSA
behavior, scientific target suitability, Python dependency advisories, external
deployment protections, and native decompressor exploitation. No deliberate
memory/disk exhaustion or load testing was performed. F10's diagnostic seeds
the post-download state rather than performing a 115-second transfer.

The original six backend test failures remain unresolved. Phase 3 can proceed
as a separate performance/maintainability review; this report does not claim
production readiness.

## Phase 3 — Performance and maintainability

### Review checklist

- [x] Inspect frontend rendering, allocation, and resource lifetimes.
- [x] Measure representative offline backend CPU costs.
- [x] Inspect production bundle output and loading structure.
- [x] Assess automated-test coverage and maintainability gaps.
- [x] Record evidence, worthwhile improvements, and measurement limits.

### Checks and measurement conditions

- Frontend checks rerun: **83 Node tests passed**, lint passed.
- A fresh Vite build into `/tmp/opencode/astrea-review-bundle` succeeded.
  Build-time module inspection used an in-memory plugin; repository build
  configuration was not changed.
- Frontend reproduction:
  `node /tmp/opencode/astrea-frontend-perf-review.mjs`.
  Assertions for F12–F14 passed using actual hook modules, instrumented component
  effects, real Three.js resource objects, mocked fetch, and simulated timers.
  No WebGL renderer or real browser was used.
- Backend reproduction, from `backend/`:
  `PYTHONPATH=. .venv/bin/python /tmp/opencode/astrea-backend-perf-review.py`.
  IERS auto-download was disabled; the image fixture was bundled onboarding
  data and sky fixtures were synthetic. No external archives were contacted.
- Timings are local diagnostics, not production service-level measurements.
  CPU timings varied between runs. The measurements below use the final run,
  with medians of three samples where stated.
- Temporary harnesses are review artifacts, not committed regression tests.

### Confirmed findings

#### F11 — Maximum gzip compression adds substantial sky-response CPU cost

- **Severity:** Medium (response latency and CPU efficiency).
- **Evidence:** `backend/app/application.py:23` enables `GZipMiddleware`
  without setting `compresslevel`. The installed middleware defaults to level
  **9**. `frontend/src/services/sky.js:10` requests JSON, including 13 direction
  samples per star for live mode, rather than the available binary format.
- **Offline measurement:** for 10,000 synthetic stars, sky calculation took a
  median **253 ms**; compact JSON was **5,710,695 bytes**. Compressing the same
  body three times at each level produced:

  | gzip level | Median compression time | Compressed bytes |
  | --- | --- | --- |
  | 1 | 98 ms | 2,296,410 |
  | 6 | 462 ms | 2,111,956 |
  | 9 | 1,484 ms | 2,092,461 |

  A separate three-request-per-configuration ASGI endpoint check with the same
  synthetic catalog measured median **1,771 ms** with gzip 9 versus **614 ms**
  with gzip 1. For that diagnostic only, the middleware setting was changed on
  temporary app instances in memory. No application source was changed.
- **Impact:** level 9 spent about 15 times the compression CPU of level 1 to
  save about 9% of level 1's response bytes (level 1 is about 10% larger).
  This can be a more worthwhile first optimization than caching tiny geometry.
  Actual catalog counts, network conditions, and deployment throughput were
  not measured.
- **Suggested follow-up:** compare an explicitly lower compression level with
  real representative sky responses before selecting a trade-off. Keep any
  binary-transport frontend integration as a separate, larger option.
- **Status:** Open; no fix applied.

#### F12 — Refreshing one projection rebuilds every frame's rendering resources

- **Severity:** Medium (avoidable resource churn).
- **Evidence:** `frontend/src/hooks/useProjectedImages.js:83`–92 recreates all
  per-image wrapper objects when any projection result changes.
  `frontend/src/three/elements/FitsImage.jsx:52`–63 uses the entire `active`
  object as an effect dependency and recreates its texture, geometry, and
  material when that reference changes.
- **Offline reproduction:** with four loaded frames, one mocked projection
  response changed all four `active` references and caused **four texture
  creations and four disposals**, including frames whose projection did not
  change.
- **Impact:** live refresh or retry can recreate resources for otherwise
  unchanged frames. A browser may need to upload their textures again when
  rendered; actual GPU upload time and visible stutter were not measured.
- **Suggested follow-up:** preserve unchanged per-frame identities and separate
  pixel-texture lifetime from projection/geometry updates. Keep existing
  cleanup guarantees.
- **Status:** Open; no fix applied.

#### F13 — Loaded images retain a redundant normalized pixel array

- **Severity:** Medium (memory efficiency).
- **Evidence:** `frontend/src/three/core/imageDataUtils.js:15`–24 returns raw
  pixels plus a normalized array. Loader state retains that decoded object.
  `frontend/src/hooks/useImageAppearance.js:52`–56 then normalizes the raw
  arrays again; `frontend/src/three/core/SkyScene.jsx:27`–29 passes this second
  normalization to the renderer.
- **Offline reproduction:** a synthetic 2048 × 2048 float32 image retained
  **16 MiB raw + 16 MiB initial normalized + 16 MiB appearance normalized**.
  The two normalized arrays were equal but separately allocated, even with
  processing disabled and only one image selected.
- **Impact:** an avoidable **16 MiB per example image**, scaling with pixel
  count and sequence length, plus duplicate normalization work. This is
  retained duplication, not evidence of an unbounded leak. The synthetic
  dimensions illustrate scaling, not the default seven-arcminute cutout size.
- **Suggested follow-up:** let appearance own display normalization and retain
  only the needed raw data in loader state. Preserve native float64 precision,
  shared comparison scaling, and all decoding callers' contracts.
- **Status:** Open; no fix applied.

#### F14 — Suspended onboarding workspaces continue periodic background work

- **Severity:** Low (background CPU and requests).
- **Evidence:** `frontend/src/components/layout/AppViewport.jsx:16`–18 keeps
  the ordinary workspace mounted behind the tutorial.
  `frontend/src/components/layout/AppWorkspace.jsx:99`–103 applies `suspended`
  to DOM interaction/visibility and Canvas drawing, but does not propagate it
  to clock, star, or projection hooks at lines 30–32 and 51–57.
- **Offline reproduction:** reproducing those hooks with one loaded live
  image over 180 simulated seconds produced **180 clock ticks, three sky
  requests, and four projection requests**. The harness reproduced the hook
  composition rather than mounting the full workspace.
- **Impact:** restarting onboarding can leave hidden requests, calculations,
  and React updates competing with tutorial work despite rendering suspension.
- **Suggested follow-up:** suspend periodic effects and cancel obsolete work
  while retaining the previous session; check expiry and refresh on resume.
- **Status:** Open; no fix applied.

#### F15 — Maintained frontend tests do not exercise live image-hook lifecycles

- **Severity:** Medium (regression coverage and maintainability).
- **Evidence:** inspection of the 83 top-level Node tests in 16 `.test.mjs`
  files found **73 synchronous utility/config tests**, **eight asynchronous
  service/request tests**, and **two comparison-task concurrency/cancellation
  tests**. None imports and executes React hooks or components.
  These are real behavioral tests, not source-string assertions.
- The existing React browser fixture has 18 self-running checks, but uses
  paused time (`frontend/tests/comparison-browser.jsx:23`), single-timestamp
  projection fixtures (line 36), and paused context changes (line 368).
  Its projection checks at lines 278–285 do not exercise live refresh/expiry.
- `frontend/package.json:7`–11 exposes `node --test` but no browser verification
  command. `frontend/docs/COMPARISON.md:69`–76 requires opening the fixture
  manually. Its machine-readable status at
  `frontend/tests/comparison-browser.jsx:375`–378 is not consumed by a
  repository-defined runner.
- **Impact:** all 83 Node tests can pass while F9/F10 remain. The interactive
  inspector visual fixture is not asserted lifecycle coverage either.
  This gap is distinct from missing CI (F4): local scenarios and an automated
  browser acceptance command are also missing.
- **Suggested follow-up:** extend the existing React/Vite fixture with
  controlled live clocks, multi-sample projections, and direct single-image
  hook checks for F9/F10. Reuse its status/results contract when establishing
  a browser verification command; a testing-framework rewrite is not needed.
- **Status:** Open; no maintained regression tests added during review.

#### F16 — ESLint applies no rules to Node test files

- **Severity:** Low (test maintainability).
- **Evidence:** `frontend/eslint.config.js:10` targets only
  `**/*.{js,jsx}`; all 16 Node test files use `.mjs`.
- **Independent reproduction:** ESLint `calculateConfigForFile` reported
  **zero rules** for `tests/imageComparison.test.mjs` and **81 rules** for
  `src/hooks/useProjectedImage.js`. Linting
  `const unused = missingName;` in memory returned no diagnostics for the
  test filename, but `no-unused-vars` and `no-undef` for the source filename.
- **Impact:** `npm run lint` can pass while these tests have undeclared names
  or other errors detectable by the project's existing recommended rules.
- **Suggested follow-up:** add Node-appropriate lint coverage for
  `tests/**/*.mjs`, reusing installed `@eslint/js` and `globals` rather than
  applying browser/React rules indiscriminately.
- **Status:** Open; no configuration changes applied.

### Measured leads that do not yet justify a fix

#### Production bundle

The fresh build reproduced the **1,365.35 kB minified / 390.08 kB gzip** entry
chunk. It has no dynamic imports. Module metadata showed the largest
contributions came from Three.js, React DOM, React Three Fiber, and GSAP.
Module rendered lengths are pre-final-minification accounting, not compressed
download sizes.

The main product is a 3D workspace, so finding rendering libraries in the
initial bundle is expected. No cold-browser parse/compile time or mobile
startup trace was collected. Do not add manual chunks merely to silence the
warning: splitting code that is still immediately required need not reduce
initial work. Measure startup first, then consider deferring genuinely
nonessential UI or animations if the trace supports it.

#### Rebuilding the backend's static WCS mesh

`backend/app/services/image_geometry.py:124`–130 reconstructs WCS and calls
`build_mesh` on every projection, although that mesh is independent of the
observer/time. For the bundled 68 × 68 image, nine warm live projections had
median **28.2 ms total**, including **5.5 ms** for mesh construction, with
eight mesh segments and 13 time samples.

This is confirmed repeated work, but small in the measured example.
Higher-distortion images or long sequences could change the trade-off; neither
was profiled. A bounded static-mesh cache may become worthwhile, but it is not
the first optimization justified by these measurements.

### Phase 3 limits

No real-browser frame-time/startup profile, WebGL/GPU-memory measurement,
mobile-device test, external-network latency measurement, or multi-user load
test was performed. Synthetic catalog and image sizes are explicitly
illustrative. The existing baseline backend failures and all review findings
remain unresolved; passing frontend tests/lint/build do not establish release
readiness.

### Phase 3 conclusion

Six new findings were recorded (F11–F16): compression cost, rendering-resource
churn, redundant normalized arrays, hidden-workspace background activity,
live-lifecycle test coverage, and missing lint rules for Node tests.
Application code and dependencies remain unchanged.

The best-supported performance follow-ups are compression tuning and reducing
unnecessary allocations/resource rebuilds. Broad framework changes, a database,
new state-management dependencies, and a speculative caching layer are not
justified by this review. Phase 4 should consolidate priorities, distinguish
prototype requirements from deployment safeguards, and identify what still
needs manual acceptance before selecting fixes.

## Phase 4 — Consolidated priorities and remaining work

### Review checklist

- [x] Consolidate all findings into decision-oriented priorities.
- [x] Reconcile findings with existing requirements and backlog.
- [x] Separate prototype acceptance, public deployment, and optional roadmap work.
- [x] Define the evidence still needed before readiness claims.
- [x] Verify report completeness and unchanged application scope.

### Overall assessment

Astrea has substantial implemented functionality, but **is not yet verified
release-ready**. The recorded backend baseline is 222 passed / six failed;
frontend tests, lint, and production build passed in earlier phases. These
results were not rerun in Phase 4, which consolidates the existing evidence.
All **16 findings remain open**; this review fixed none of them.

The main gaps are a broken backend test gate, bounded/accurate archive failure
handling, cache-readiness integrity, live-projection lifecycle behavior, and
missing end-to-end acceptance. No architecture rewrite is justified.

### Consolidated triage

Priorities below describe recommended urgency, not new severity ratings or an
implementation plan. Within a group, related findings should be checked
together; shipping fixes still requires regression evidence.

| Priority / gate | Findings | Why it matters | Evidence needed to close |
| --- | --- | --- | --- |
| First: restore reliable feedback | **F1, F2** | Five recrop cases never reach the endpoint; the sixth failure is a stale route assertion. | Consolidated helper/callers, reconciled route contract, and a passing full backend suite without weakening valid assertions. |
| Must fix before accepting affected workflows | **F8** | Malformed upstream FITS descriptors can authorize gigabyte-scale reads despite tiny cutouts. | Synthetic descriptor tests reject out-of-heap/file ranges and independently over-budget reads before network access or large allocation; valid compressed FITS still works. |
| Must fix before accepting affected workflows | **F9, F10** | Live refresh can stop blink or leave single-image projections expired. | Maintained tests cover refresh between HUD ticks, nearly expired seeds, and paused-time behavior; browser acceptance confirms playback and framing. |
| Must fix before accepting affected workflows | **F6, F7** | Slow bodies exceed the absolute budget; wrapped read timeouts are retried and mapped incorrectly. | Local trickle/stall tests cover range and fallback paths, total budget across retries, no timeout retries, and the intended 504 mapping. |
| Must fix before trusting cache/offline readiness | **F5** | Empty/truncated binaries are served and counted as ready. | Tests cover invalid image/plane lengths, serving behavior, and a nonzero offline-verification result for unusable entries; valid caches remain reusable. |
| Verification and handoff gate | **F3, F4, F15, F16** | Documentation overstates readiness; no tracked CI gate, live-hook regression suite, or Node-test lint rules were found. | Accurate entry-point docs, a repository-defined automated gate, live-lifecycle browser checks with an explicit verification command, and Node-appropriate `.mjs` lint coverage. |
| Performance follow-ups after correctness | **F11, F12, F13** | Measured compression cost, unnecessary rendering-resource churn, and duplicate retained arrays. | Representative compression trade-off; unchanged frames retain resources; pixel-memory reductions preserve float precision and shared scaling. Confirm user-visible effects in a browser. |
| Lower-priority efficiency polish | **F14** | Hidden onboarding workspaces continue periodic work. | Suspension stops background effects without losing session state; resume refreshes expired data. |
| Conditional: before unrestricted public exposure | **Persistent-cache deployment risk** | Valid requests grow persistent files without a demonstrated bound. | Documented/tested disk and inode limits, traffic/concurrency controls, and recovery behavior appropriate to the actual deployment. |

F1/F2 are feedback blockers, not demonstrated recrop endpoint defects.
F8 is upstream-data resource hardening, not a demonstrated SSRF exploit.
F11–F14 are efficiency findings, not proof of production latency or GPU leaks.
The public-deployment gate does not require adding accounts, a database, or
multi-worker support to the prototype.

### Reconciliation with requirements and existing tasks

The source documents retain their existing status markers. This report records
the qualifications below rather than silently marking tasks done or rewriting
requirements.

| Existing item | Review reconciliation |
| --- | --- |
| `requirements.md` **NFR-3, NFR-4, NFR-6** marked met | F6/F7 provide counterexamples to total-budget enforcement, no-timeout-retry policy, and intended timeout status. Their unconditional “met” claims need reassessment when fixes and tests land. |
| **NFR-7** marked met | F8 bypasses the intended independent download-size bound through compressed descriptors. URL allowlisting does not close that resource-bound gap. |
| **DATA-2, OFF-3, OFF-4** marked met | F5 shows that existing-file checks do not establish valid pixel layout or ready offline data. Normal-cache tests do not cover this damaged-cache case. This does not disprove atomic writes under NFR-5. |
| `tasks.md` **3.3** pending | Remains pending. Existing independent-image API tests and implemented frontend playback do not replace joint browser/WCS/shared-scale/error-state acceptance. F9/F10 are relevant blockers; F15 is the regression-coverage gap. |
| **4.4** pending; **AT-1–AT-5** not accepted | Remain pending. Target propagation, a warm command, and bundled onboarding data do not demonstrate suitable live observations or discernible scientific change. |
| **4.3** marked done, with limited scope | Cache warming/CLI verification is implemented, but F5 weakens its readiness claim. The task explicitly says full offline browser discovery requires a separate manifest handoff or cached-search path. Do not treat CLI success as completion of 4.4. |
| **5.3** cache eviction/quotas, **5.4** multi-worker safety | Later prototype work. Storage protection becomes a prerequisite for unrestricted public exposure; multi-worker safety becomes a prerequisite only if that deployment model is chosen. |
| **5.1, 5.2, 5.5–5.9** | Later-roadmap items, not automatically missing prototype requirements or release blockers. Their pending markers were not an independent feature-absence audit. |

References: [`backend tasks`](sdd/backend/tasks.md),
[`backend requirements`](sdd/backend/requirements.md). The latter explicitly
scopes out quotas, TLS, and multi-worker scaling and assigns playback/display
scaling to the frontend. No server-side blink service or common-grid
reprojection is needed to close the current visual-comparison review.

### Unfinished acceptance and verification

1. **Joint browser integration — task 3.3.** Record browser/version and
   observations; check independent WCS placement, shared display scale, date
   and detector labels, loading/empty/error states, cancellation of obsolete
   selections, and switching without archive downloads. Exercise live refresh
   across multiple windows, near-expiry loading, paused time, and tutorial
   suspend/resume. Run the existing comparison fixture and record its results.
2. **Live data and scientific suitability — task 4.4 / AT-1–AT-5.** Run the
   live warm checks deliberately, record observation dates and spans, and judge
   whether expected motion/variability is discernible. Document unsuitable
   targets and confounders; playback is not a detection.
3. **Optional full offline demo.** Verify usable cached binaries, not merely
   file presence. Establish and test the offline discovery/manifest handoff
   required by 4.3/4.4 before claiming an end-to-end offline demo. Test the
   actual browser path with networking disabled; bundled onboarding alone
   does not establish arbitrary-target offline discovery.
4. **Security/deployment checks.** Run a Python dependency advisory scan;
   `pip check` only established dependency consistency. Inspect the real
   deployment's access boundary, storage limits, TLS termination, and traffic
   controls if public exposure is intended. The earlier zero-result npm audit
   is time-specific, not a security guarantee.
5. **Performance acceptance.** Measure cold-browser startup, frame time,
   memory/resource lifetime, and a representative comparison sequence on
   target hardware. Assess network/load behavior before choosing throughput
   or scaling changes. Bundle splitting and static WCS caching remain
   measurement leads, not required optimizations.

No live IRSA calls, browser/WebGL acceptance, advisory scan, load test, or
deliberate resource-exhaustion test was added during this consolidation.
This is not an exhaustive audit of every product goal or future feature.

### Recommended handoff

Begin with **F1/F2 baseline restoration**, then bounded-download/cache and live
projection correctness, adding maintained regressions with each fix. Establish
the verification gate and reconcile documentation before release handoff;
then run task 3.3. Treat task 4.4 as necessary only for the claimed
scientific-target/offline-demo capabilities, not as a prerequisite for all
visual blink use.

Performance improvements can follow correctness in small independent changes.
Leave pagination, spectra, overlays, overlap search, common-grid differences,
and broad architecture changes in the existing roadmap unless product needs
change. Implementation requires a separate go-ahead; no fixes or commits were
made during the four review phases.

Phase 4 verification checked coverage of F1–F16 in the triage, local reference
links, whitespace, and Git scope. HEAD remains `bd77aeb`; the only worktree
change is this untracked review document. All four review phases are complete;
remediation and acceptance remain outstanding.
