// Open /tests/comparison-browser.html through Vite. This deliberately exercises
// the real hooks in React rather than depending on a second test renderer.
import { useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import useImageComparison from '../src/hooks/useImageComparison.js'
import useComparisonPresentation from '../src/hooks/useComparisonPresentation.js'
import ImageComparisonPanel from '../src/components/blink-hud/ImageComparisonPanel.jsx'
import Tabs from '../src/components/common/Tabs.jsx'
import HelpButton from '../src/components/common/HelpButton.jsx'
import InspectorIcon from '../src/components/controls/InspectorIcons.jsx'
import DetectorSelector from '../src/components/controls/DetectorSelector.jsx'
import ObservationDate from '../src/components/controls/ObservationDate.jsx'
import I18nProvider from '../src/i18n/I18nProvider.jsx'
import useTranslation from '../src/i18n/useTranslation.js'
import { decodePixels } from '../src/three/core/imageDataUtils.js'
import '../src/styles/main.css'

// Re-run deterministic checks from a fresh root and fetch mock after code edits.
if (import.meta.hot) import.meta.hot.on('vite:beforeUpdate', () => window.location.reload())

const observer = { latitude: 13.7, longitude: -89.2 }
const year = new Date().getUTCFullYear()
const initialContext = { mode: 'paused', at: `${year}-11-15T12:00:00Z` }
const calls = []
const playbackSnapshots = []
const originalFetch = window.fetch
const imageFormat = { width: 2, height: 1, dtype: 'float32', byte_order: 'little', array_order: 'C', pixel_origin: 'lower-left', unit: 'MJy/sr' }
const dates = { a: `${year}-11-15T12:00:00Z`, b: `${year}-01-05T09:00:00Z`, c: '2025-02-20T05:00:00Z', d: `${year}-07-13T09:00:00Z`, e: `${year}-05-12T09:00:00Z` }
const values = { a: [4, 8], b: [0, 4], c: [4, 20], d: [4, 12], e: [4, 14] }
const previewDates = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [
  `preview-${index + 1}`, new Date(Date.UTC(year, 0, 1, 9, index * 7)).toISOString(),
]))
const metadata = (id) => ({ id, detector: 1, collection: 'spherex_fixture', image: imageFormat,
  observation: { start_utc: dates[id] ?? previewDates[id] }, requested: { ra_deg: 210, dec_deg: 54, size_deg: 0.1, frame: 'icrs' } })
const pixels = (id) => new Float32Array(values[id] ?? [4, 12]).buffer
const projection = (at) => ({ sample_times_ms: [Date.parse(at)], uv: [0, 0, 1, 0, 0, 1], indices: [0, 1, 2], directions: [[1, 0, 0, 0, 1, 0, 0, 0, 1]] })
const primary = { metadata: metadata('a'), pixels: decodePixels(pixels('a'), imageFormat),
  projection: projection(initialContext.at), observer, timeContext: initialContext }
let delayedAborted = false
let nextSearchMode = 'normal'
const pendingSearches = []

window.fetch = async (input, options = {}) => {
  const url = new URL(input, window.location.href)
  if (!url.pathname.startsWith('/api/v1/images')) return originalFetch(input, options)
  calls.push({ url, options })
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (url.pathname === '/api/v1/images') {
    const requestedYear = Number(url.searchParams.get('start_time')?.slice(0, 4))
    const mode = nextSearchMode
    nextSearchMode = 'normal'
    if (mode === 'delayed') {
      // Deliberately resolve after abort to also verify stale response rejection.
      return new Promise((resolve) => pendingSearches.push({ resolve, signal: options.signal }))
    }
    if (mode === 'failure') return new Response(JSON.stringify({ detail: 'IRSA search is temporarily unavailable.' }), { status: 502 })
    const images = mode === 'empty' ? [] : Object.keys(dates).filter((id) => dates[id].startsWith(String(requestedYear))).map(metadata)
    return new Response(JSON.stringify({ images, has_more: requestedYear === year && mode !== 'empty' }))
  }
  const load = url.pathname.match(/\/load\/([a-z0-9-]+)$/)
  if (load) {
    const id = load[1]
    if (id === 'd') return new Response(JSON.stringify({ detail: 'IRSA data could not be retrieved. Please retry.' }), { status: 502 })
    if (id === 'e') return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => resolve(new Response(JSON.stringify(metadata(id)))), 5000)
      options.signal.addEventListener('abort', () => {
        delayedAborted = true
        window.clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      }, { once: true })
    })
    return new Response(JSON.stringify(metadata(id)))
  }
  const frame = url.pathname.match(/\/([a-z0-9-]+)\/(pixels|projection)$/)
  if (frame?.[2] === 'pixels') return new Response(pixels(frame[1]))
  if (frame?.[2] === 'projection') return new Response(JSON.stringify(projection(JSON.parse(options.body).at)))
  throw new Error(`Unexpected mock endpoint: ${url}`)
}

let current
export default function Harness() {
  const { t } = useTranslation()
  const [context, setContext] = useState(initialContext)
  const [timestamp, setTimestamp] = useState(Date.parse(initialContext.at))
  const [narrow, setNarrow] = useState(false)
  const [short, setShort] = useState(false)
  const [longList, setLongList] = useState(false)
  const [checksReady, setChecksReady] = useState(false)
  const comparison = useImageComparison(primary, true, observer, context, 4096)
  const presentation = useComparisonPresentation(comparison, observer, context, timestamp, 'ready')
  const { frames, appearance, projections, playback, reason, displayed } = presentation
  useLayoutEffect(() => {
    current = { comparison, frames, appearance, projections, playback, displayed, setContext, setTimestamp, setChecksReady }
    const timeline = timelineInput()
    playbackSnapshots.push({ id: playback.frameId, playing: playback.playing,
      position: timeline ? Number(timeline.value) : null,
      displayedId: displayed?.metadata.id,
      metadataId: document.querySelector('.comparison-timeline-current')?.dataset.observationId })
  },
    [comparison, frames, appearance, projections, playback, displayed])
  const shownComparison = longList ? { ...comparison, candidates: Object.keys(previewDates).map(metadata), hasMore: true,
    searchedYear: year, dirty: false } : comparison
  const shownMetadata = displayed.metadata
  const tabs = ['data', 'appearance', 'compare'].map((name) => ({ id: name, label: t(`inspector.tabs.${name}`), icon: <InspectorIcon name={name} /> }))
  return <>
    <output id="hook-state">{JSON.stringify({ status: comparison.status, year: comparison.year, ids: comparison.images.map((image) => image.metadata.id),
      frameId: playback.frameId, frame: playback.frame, playing: playback.playing, error: comparison.error })}</output>
    <div className="comparison-browser-controls" aria-label="Visual preview controls">
      <button type="button" onClick={() => setNarrow((value) => !value)}>{narrow ? 'Wide panel (480px)' : 'Narrow panel (350px)'}</button>
      <button type="button" onClick={() => setShort((value) => !value)}>{short ? 'Tall panel (780px)' : 'Short panel (480px)'}</button>
      <button type="button" disabled={!checksReady} onClick={() => setLongList((value) => !value)}>{longList ? 'Restore test candidates' : 'Preview 100 candidates'}</button>
    </div>
    <p className="comparison-browser-note">Representative inspector shell; Compare is interactive. Preview observations use local mock data.</p>
    <aside className="image-inspector" data-open="true" data-active-tab="compare" aria-label={t('inspector.title')}
      style={{ position: 'relative', width: `min(${narrow ? 350 : 480}px, 100%)`, height: short ? 480 : 780, maxHeight: 'none', inset: 'auto', marginTop: 16 }}>
      <div className="inspector-topbar">
        <Tabs id="comparison-fixture" label={t('inspector.title')} items={tabs} value="compare" onChange={() => {}} />
        <button type="button" className="inspector-close" aria-label={t('inspector.actions.close')}><InspectorIcon name="close" /></button>
      </div>
      <div className="inspector-surface">
        <header className="inspector-summary">
          <div className="inspector-observation-heading">
            <div><span className="context-note">{t('inspector.observation')} · {playback.frame}</span>
              <strong><ObservationDate value={shownMetadata.observation.start_utc} /></strong></div>
            <HelpButton label={t('inspector.observation')} message={t('inspector.help.observationDate')} />
          </div>
          <div className="inspector-identity">
            <span>{t('inspector.detector', { detector: shownMetadata.detector })}</span>
            <span className="inspector-release"><span>{t('inspector.release', { release: shownMetadata.collection })}</span>
              <HelpButton label={t('inspector.releaseLabel')} message={t('inspector.help.release')} /></span>
          </div>
          <DetectorSelector value={shownMetadata.detector} onChange={() => {}} />
        </header>
        <div className="inspector-panels">
          <div role="tabpanel" id="comparison-fixture-panel-compare" aria-labelledby="comparison-fixture-tab-compare" tabIndex={0}>
            <ImageComparisonPanel comparison={shownComparison} playback={playback} reason={t(reason)} primary={primary} frames={frames} projections={projections} />
          </div>
        </div>
        <div className="inspector-bottom"><button type="button" className="text-action">{t('inspector.actions.newRegion')}</button></div>
      </div>
    </aside>
  </>
}

const root = createRoot(document.getElementById('root'))
root.render(<I18nProvider><Harness /></I18nProvider>)
const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))
async function until(predicate, description, timeout = 3000) {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeout) throw new Error(`Timed out: ${description}`)
    await sleep(10)
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message)
}
function timelineInput() {
  return [...document.querySelectorAll('input[type="range"]')].find((input) =>
    /^(Observation timeline|Recorrido de observaciones)$/.test(input.getAttribute('aria-label')))
}
function changeRange(input, value) {
  // Use the native setter so React's change tracker sees a real input change.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value))
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const results = []
async function check(name, action) {
  try {
    await action()
    results.push({ name, passed: true })
  } catch (error) {
    results.push({ name, passed: false, error: error.stack })
  }
  const result = results.at(-1)
  const row = document.createElement('li')
  row.textContent = `${result.passed ? 'PASS' : 'FAIL'} ${name}${result.error ? `: ${result.error}` : ''}`
  document.getElementById('results').append(row)
}

async function run() {
  await check('Opening Compare searches A’s entire UTC year, zone and detector directly', async () => {
    await until(() => current?.comparison.status === 'results', 'initial annual search')
    const query = calls.find(({ url }) => url.pathname === '/api/v1/images').url.searchParams
    assert(query.get('start_time') === `${year}-01-01T00:00:00Z`, 'Incorrect UTC year start')
    assert(query.get('end_time') === `${year}-12-31T23:59:59.999999Z`, 'Incorrect UTC year end')
    assert(query.get('ra_deg') === '210' && query.get('dec_deg') === '54', 'A’s zone was not sent')
    assert(query.get('detector') === '1' && query.get('limit') === '100', 'Incorrect detector or result bound')
    assert(current.comparison.candidates.some(({ id }) => id === 'b'), 'January observation missing from November reference search')
    assert(current.comparison.hasMore, 'Truncated annual result lost its has_more signal')
    assert(!calls.some(({ url }) => /availability|\/(load|pixels|projection)(\/|$)/.test(url.pathname)), 'Annual discovery issued availability or FITS requests')
  })
  await check('The only date selector is Year, with options from 2025 through the current year', async () => {
    const selectors = [...document.querySelectorAll('[role="combobox"]')]
    assert(!selectors.some((entry) => /^(day|month|día|mes)$/i.test(entry.getAttribute('aria-label'))), 'Day or month selector is still present')
    const yearSelect = selectors.find((entry) => /^(year|año)$/i.test(entry.getAttribute('aria-label')))
    assert(Boolean(yearSelect), 'Year selector is missing')
    const list = document.getElementById(yearSelect.getAttribute('aria-controls'))
    const options = [...list.querySelectorAll('[role="option"]')].map((entry) => Number(entry.textContent.trim()))
    assert(options.join() === Array.from({ length: year - 2025 + 1 }, (_, index) => year - index).join(), 'Selector offers years outside the mission')
  })
  await check('Adding B retains A and prevents duplicate downloads', async () => {
    const timeline = timelineInput()
    assert(timeline?.disabled && timeline.value === '0' && timeline.max === '0', 'A-only timeline should be disabled at its only frame')
    assert(document.querySelector('.comparison-timeline-current')?.dataset.observationId === 'a', 'A-only timeline metadata is missing')
    assert(!document.querySelector('.comparison-frames'), 'Selected observation cards are still rendered')
    current.comparison.load('b')
    await until(() => current.comparison.images.length === 2, 'B loaded')
    current.comparison.load('b')
    await sleep(30)
    assert(calls.filter(({ url }) => url.pathname.endsWith('/load/b')).length === 1, 'B downloaded twice')
  })
  await check('Changing year preserves loaded frames and discovers C in 2025', async () => {
    current.comparison.setYear(2025)
    await until(() => current.comparison.searchedYear === 2025 && current.comparison.status === 'results', '2025 annual search')
    assert(current.comparison.images.length === 2, 'Changing year discarded B')
    assert(current.comparison.candidates.some((item) => item.id === 'c'), '2025 observation not discoverable')
    current.comparison.load('c')
    await until(() => current.comparison.images.length === 3, 'C loaded')
  })
  await check('Changing detector refreshes the annual list and retains the sequence', async () => {
    const before = calls.length
    current.comparison.setSameDetector(false)
    await until(() => calls.slice(before).some(({ url }) => url.pathname === '/api/v1/images' && !url.searchParams.has('detector')), 'all-detector annual search')
    await until(() => current.comparison.status === 'results', 'all-detector results')
    assert(current.comparison.images.length === 3, 'Detector change discarded frames')
    const restore = calls.length
    current.comparison.setSameDetector(true)
    await until(() => calls.slice(restore).some(({ url }) => url.searchParams.get('detector') === '1'), 'restore detector')
    await until(() => current.comparison.status === 'results', 'restore results')
  })
  await check('An empty year is a successful empty list and retains the sequence', async () => {
    nextSearchMode = 'empty'
    current.comparison.setYear(year)
    await until(() => current.comparison.searchedYear === year && current.comparison.status === 'results', 'empty year result')
    assert(current.comparison.candidates.length === 0 && !current.comparison.error, 'Empty year retained old observations or an error')
    assert(!current.comparison.hasMore, 'Empty result retained stale truncation flag')
    assert(current.comparison.images.length === 3, 'Empty year discarded sequence')
  })
  await check('Annual search failure is an error and retry recovers the year’s observations', async () => {
    nextSearchMode = 'failure'
    current.comparison.search()
    await until(() => current.comparison.status === 'error', 'annual search error')
    assert(Boolean(current.comparison.error), 'Failure was reported as an empty year')
    assert(current.comparison.images.length === 3, 'Search failure discarded sequence')
    current.comparison.retry()
    await until(() => current.comparison.status === 'results' && current.comparison.candidates.some(({ id }) => id === 'b'), 'retried annual search')
    assert(!current.comparison.error, 'Retry did not clear error')
  })
  await check('Cancelled annual search can retry; its late response cannot replace another year', async () => {
    nextSearchMode = 'delayed'
    current.comparison.setYear(2025)
    await until(() => pendingSearches.length === 1 && current.comparison.status === 'searching', 'delayed annual search')
    current.comparison.cancel()
    await until(() => current.comparison.status === 'cancelled', 'cancel annual search')
    assert(pendingSearches[0].signal.aborted, 'Cancel did not abort the request')
    assert(current.comparison.images.length === 3, 'Cancel removed loaded frames')
    current.comparison.retry()
    await until(() => current.comparison.searchedYear === 2025 && current.comparison.status === 'results', 'retry cancelled search')
    current.comparison.setYear(year)
    await until(() => current.comparison.searchedYear === year && current.comparison.status === 'results', 'restore reference year')
    pendingSearches[0].resolve(new Response(JSON.stringify({ images: [metadata('c')], has_more: false })))
    await sleep(30)
    assert(current.comparison.year === year && current.comparison.searchedYear === year, 'Late result replaced selected year')
    assert(current.comparison.candidates.some(({ id }) => id === 'b') && !current.comparison.candidates.some(({ id }) => id === 'c'), 'Late result replaced current candidates')
  })
  await check('Invalid historical and future years cannot issue searches', async () => {
    const before = calls.length
    for (const invalid of [1900, 2024, year + 1]) current.comparison.setYear(invalid)
    await sleep(30)
    assert(current.comparison.year === year && calls.length === before, 'Invalid year changed state or requested data')
  })
  await check('A, B and C share one intensity scale and chronological order', async () => {
    assert(current.frames.map((frame) => frame.id).join() === 'c,b,a', 'Timeline is not chronological')
    const scaled = current.appearance.pixels
    assert(scaled[0].values[0] === scaled[1].values[1] && scaled[1].values[1] === scaled[2].values[0], 'Equal raw intensities have different display values')
  })
  await check('Clock-only updates preserve projected image identity', async () => {
    const before = current.projections.byId.a.image
    current.setTimestamp(Date.parse(initialContext.at) + 1)
    await until(() => !current.projections.ready, 'timestamp render')
    assert(current.projections.byId.a.image === before, 'Clock tick recreated projected image')
    current.setTimestamp(Date.parse(initialContext.at))
    await until(() => current.projections.ready, 'restore timestamp')
  })
  await check('Blink accepts tenths of a second, clamps its range and rejects invalid intervals', async () => {
    current.playback.setInterval(0.01)
    await until(() => current.playback.interval === 0.1, 'minimum 0.1-second interval')
    current.playback.setInterval(4)
    await until(() => current.playback.interval === 3, 'maximum interval')
    current.playback.setInterval(0.26)
    await until(() => current.playback.interval === 0.3, 'interval rounded to tenths')
    for (const value of [0, -1, NaN, Infinity, 'invalid']) current.playback.setInterval(value)
    await sleep(30)
    assert(current.playback.interval === 0.3, 'Invalid interval changed the current value')
    const interval = [...document.querySelectorAll('input[type="range"]')].find((input) => input !== timelineInput())
    assert(interval?.min === '0.1' && interval.step === '0.1' && interval.max === '3', 'Interval input does not offer 0.1-second steps')
  })
  await check('At 0.1 seconds, autoplay loops C, B, A and updates the slider without downloading', async () => {
    current.playback.show('c')
    current.playback.setInterval(0.1)
    await until(() => current.playback.frameId === 'c' && current.playback.interval === 0.1, 'show C at 0.1 seconds')
    const count = calls.length
    const start = playbackSnapshots.length
    current.playback.toggle()
    const visited = () => playbackSnapshots.slice(start).filter((snapshot) => snapshot.playing)
      .filter((snapshot, index, entries) => index === 0 || snapshot.id !== entries[index - 1].id)
    await until(() => visited().length >= 4, '0.1-second blink loop')
    current.playback.pause()
    await until(() => !current.playback.playing, 'pause')
    const loop = visited().slice(0, 4)
    assert(loop.map(({ id }) => id).join() === 'c,b,a,c', 'Blink skipped a frame or failed to loop')
    assert(loop.every(({ id, position, metadataId, displayedId }) => current.frames[position]?.id === id && metadataId === id && displayedId === id), 'Autoplay slider or metadata lag behind the displayed image')
    assert(calls.length === count, 'Blink started additional requests')
  })
  await check('Dragging the timeline pauses autoplay, selects the matching image and preserves loaded data', async () => {
    current.playback.setInterval(3)
    current.playback.show('c')
    await until(() => current.playback.interval === 3 && current.playback.frameId === 'c', 'prepare manual scrub')
    current.playback.toggle()
    await until(() => current.playback.playing, 'autoplay before scrub')
    const before = calls.length
    const timeline = timelineInput()
    assert(!timeline.disabled && timeline.min === '0' && timeline.max === '2' && timeline.step === '1', 'Timeline does not cover all three observations')
    timeline.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await until(() => !current.playback.playing, 'pause on pointer down')
    changeRange(timeline, 1)
    await until(() => current.playback.frameId === 'b', 'scrub to B')
    assert(timeline.value === '1' && !current.playback.playing, 'Manual scrub restarted autoplay or missed slider position')
    const metadata = document.querySelector('.comparison-timeline-current')
    assert(current.displayed.metadata.id === 'b' && metadata?.dataset.observationId === 'b', 'Current image or metadata did not follow selected B')
    assert(metadata.querySelector('time')?.dateTime === new Date(dates.b).toISOString(), 'Selected B shows the wrong observation date')
    assert(calls.length === before, 'Manual scrub downloaded data')
  })
  await check('Keyboard interaction pauses autoplay without needing a pointer', async () => {
    current.playback.toggle()
    await until(() => current.playback.playing, 'play before keyboard scrub')
    const timeline = timelineInput()
    timeline.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await until(() => !current.playback.playing, 'pause on timeline keyboard interaction')
    // Browser-generated arrow movement is checked manually; dispatch the resulting input here.
    changeRange(timeline, 2)
    await until(() => current.playback.frameId === 'a', 'keyboard-selected A')
    const remove = document.querySelector('.comparison-timeline button[aria-label="Remove observation A"]')
    assert(remove?.disabled, 'Reference A can be removed from the timeline')
  })
  await check('A failed additional image does not discard the sequence', async () => {
    await current.comparison.load('d')
    await until(() => current.comparison.status === 'error', 'D failure')
    assert(current.comparison.images.map((image) => image.metadata.id).join() === 'a,b,c', 'D failure discarded frames')
  })
  await check('Removing the active observation adjusts slider bounds and preserves A and C', async () => {
    current.playback.show('b')
    await until(() => current.playback.frameId === 'b', 'show B before removal')
    const remove = document.querySelector('.comparison-timeline button[aria-label="Remove observation B"]')
    assert(remove && !remove.disabled, 'Current B has no enabled remove button')
    remove.click()
    await until(() => current.comparison.images.length === 2, 'remove B')
    assert(current.frames.map((frame) => frame.id).join() === 'c,a', 'Wrong remaining timeline')
    assert(current.frames.some((frame) => frame.id === current.playback.frameId), 'Playback points to removed frame')
    const timeline = timelineInput()
    assert(timeline.max === '1' && current.frames[Number(timeline.value)]?.id === current.playback.frameId, 'Removing a frame left incorrect slider bounds or value')
    assert(document.querySelector('.comparison-timeline-current')?.dataset.observationId === current.playback.frameId, 'Removing a frame left stale displayed metadata')
  })
  await check('Changing sky time aborts an in-flight addition and retains loaded frames', async () => {
    current.comparison.load('e')
    await until(() => current.comparison.pendingId === 'e', 'E started')
    const nextContext = { mode: 'paused', at: `${year}-11-16T12:00:00Z` }
    current.setContext(nextContext)
    current.setTimestamp(Date.parse(nextContext.at))
    await until(() => delayedAborted && current.comparison.pendingId === null, 'abort old E context')
    assert(current.comparison.images.map((image) => image.metadata.id).join() === 'a,c', 'Aborted load changed sequence')
    await until(() => current.projections.ready, 'reproject retained frames')
  })
  window.__comparisonHarness = { results, calls, get current() { return current } }
  const failed = results.filter((result) => !result.passed).length
  document.getElementById('summary').textContent = `${results.length - failed}/${results.length} passed${failed ? `; ${failed} failed` : ''}`
  document.body.dataset.testStatus = failed ? 'failed' : 'passed'
  current.setChecksReady(true)
}

run().catch((error) => { document.getElementById('summary').textContent = error.stack; document.body.dataset.testStatus = 'failed' })
