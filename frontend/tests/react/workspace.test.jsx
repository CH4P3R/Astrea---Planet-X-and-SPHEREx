import { StrictMode, useEffect } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AppWorkspace from '../../src/components/layout/AppWorkspace.jsx'
import AppViewport from '../../src/components/layout/AppViewport.jsx'
import I18nProvider from '../../src/i18n/I18nProvider.jsx'
import { loadMetadata, loadPixels, loadProjection, searchCoordinates, searchImages } from '../../src/services/images.js'

const scene = vi.hoisted(() => ({ fits: null, normalMounts: 0 }))
vi.mock('@react-three/fiber', () => ({ Canvas: ({ children }) => <>{children}</> }))
vi.mock('../../src/three/core/SkyScene.jsx', () => ({
  default: function Scene({ fits, onSkyClick }) {
    scene.fits = fits
    const { setTextureLimit } = fits
    useEffect(() => { setTextureLimit(4096); scene.normalMounts += 1 }, [setTextureLimit])
    return <button onClick={() => onSkyClick({ x: 1, y: 0, z: 0 }, { x: 20, y: 20 })}>sky click</button>
  },
}))
vi.mock('../../src/hooks/useObserver.js', () => {
  const observer = { latitude: 51, longitude: 0, source: 'manual' }
  return { default: () => ({ observer, status: 'ready', error: '', locate() {}, applyManualLocation() {} }) }
})
vi.mock('../../src/hooks/useSkyClock.js', () => {
  const clock = { context: { mode: 'paused', at: '2026-11-15T00:00:00Z' }, timestamp: Date.parse('2026-11-15T00:00:00Z'),
    paused: true, apply() {}, goLive() {}, pause() {} }
  return { default: () => clock }
})
vi.mock('../../src/hooks/useStars.js', () => ({ default: () => ({ status: 'idle', snapshot: null }) }))
vi.mock('../../src/hooks/useImageViewport.js', () => ({ default: () => ({}) }))
vi.mock('../../src/hooks/useImageComparison.js', () => ({
  default: () => ({ status: 'idle', observations: [], candidates: [], images: [], year: 2026, sameDetector: false }),
}))
vi.mock('../../src/hooks/useProjectedImage.js', () => ({
  default: (image) => ({ ready: Boolean(image), image, error: '', retry() {} }),
}))
vi.mock('../../src/hooks/useComparisonPresentation.js', () => ({
  default: (comparison) => ({
    frames: [], projections: { byId: {} }, primaryProjection: { ready: true },
    appearance: { appliedProcessing: {}, settings: { palette: 'gray', exposure: 0, opacity: 1 }, processing: {},
      ready: true, hasData: true },
    playback: { pause() {}, show() {} }, displayed: comparison.images[0], frameImages: [], layers: [],
  }),
}))
vi.mock('../../src/services/images.js', async (importOriginal) => ({
  ...await importOriginal(),
  searchCoordinates: vi.fn(), searchImages: vi.fn(), loadMetadata: vi.fn(),
  loadPixels: vi.fn(), loadProjection: vi.fn(), recropImage: vi.fn(),
}))
vi.mock('../../src/three/core/imageDataUtils.js', () => ({ decodePixels: (buffer) => buffer, validateImage: vi.fn() }))

const invalid = 'This shared link has invalid search settings. Correct the coordinates or clear the search.'
const historyWarning = 'The address bar could not be updated, but the search still works.'
const result = (ra = 10, dec = 20, images = []) => ({
  images, has_more: false, query: { ra_deg: ra, dec_deg: dec, size_deg: 7 / 60 },
})
const metadata = { id: 'image-A', detector: 3, collection: 'test', observation_id: 'obs-A',
  observation: { start_utc: '2026-11-15T00:00:00Z' }, requested: { ra_deg: 10, dec_deg: 20, size_deg: 7 / 60 },
  image: { width: 1, height: 1, nonfinite_count: 0, finite_min: 0, finite_max: 1, dtype: 'float32' } }
const deferred = () => {
  let resolve
  const promise = new Promise((yes) => { resolve = yes })
  return { promise, resolve }
}
const mount = (element = <AppWorkspace />) => render(<I18nProvider>{element}</I18nProvider>)
const flush = () => act(async () => {})
const input = (name) => document.querySelector(`input[name="${name}"]`)
const sizeInput = () => document.querySelector('#context-search input[type="number"]')
const click = (name) => fireEvent.click(screen.getByRole('button', { name, exact: true }))
const openSearch = () => click('Preparation')
const edit = (ra, dec) => {
  fireEvent.change(input('ra'), { target: { value: String(ra) } })
  fireEvent.change(input('dec'), { target: { value: String(dec) } })
}
const submit = () => fireEvent.submit(input('ra').form)
const navigate = (href) => act(() => {
  window.history.pushState({}, '', href)
  window.dispatchEvent(new PopStateEvent('popstate'))
})

beforeEach(() => {
  vi.resetAllMocks()
  // jsdom has no layout tree; retain the real anchoring hook with a positioned parent.
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function () { return this.parentElement })
  window.localStorage.clear()
  scene.fits = null
  scene.normalMounts = 0
  searchCoordinates.mockImplementation(async (ra, dec) => result(ra, dec))
  searchImages.mockResolvedValue(result(30, 40))
  loadMetadata.mockResolvedValue(metadata)
  loadPixels.mockResolvedValue(new ArrayBuffer(4))
  loadProjection.mockResolvedValue({})
})
afterEach(() => vi.restoreAllMocks())

it('hydrates a shared URL atomically and does not overwrite it with defaults, including StrictMode', async () => {
  window.history.replaceState({}, '', '/?ra=83.63&dec=-5.39&size=12&detector=3&foo=1#frag')
  const replace = vi.spyOn(window.history, 'replaceState')
  mount(<StrictMode><AppWorkspace /></StrictMode>)
  expect(input('ra').value).toBe('83.63')
  expect(input('dec').value).toBe('-5.39')
  expect(sizeInput().value).toBe('12')
  await flush()
  expect(searchCoordinates).toHaveBeenCalledExactlyOnceWith(83.63, -5.39, 12, 3, expect.any(AbortSignal), 'archive')
  expect(replace).not.toHaveBeenCalled()
  expect(window.location.search).toBe('?ra=83.63&dec=-5.39&size=12&detector=3&foo=1')
  expect(window.location.hash).toBe('#frag')
})

it('opens the search panel for an invalid cold link without requests and lets Clear remove only malformed fields', async () => {
  window.history.replaceState({}, '', '/?ra=bad&foo=1#frag')
  mount()
  await flush()
  expect(searchCoordinates).not.toHaveBeenCalled()
  expect(searchImages).not.toHaveBeenCalled()
  expect(screen.getByText(invalid).getAttribute('role')).toBe('status')
  expect(document.querySelector('#context-search').getAttribute('aria-hidden')).toBe('false')
  expect(window.location.search).toBe('?ra=bad&foo=1')
  click('Clear image and results')
  await flush()
  expect(window.location.search).toBe('?foo=1')
  expect(window.location.hash).toBe('#frag')
  expect(screen.queryByText(invalid)).toBeNull()
  navigate('/?ra=bad&foo=1#frag')
  edit(83.63, -5.39)
  expect(screen.getByText(invalid)).toBeTruthy()
  expect(window.location.search).toBe('?ra=bad&foo=1')
  submit()
  await flush()
  expect(screen.queryByText(invalid)).toBeNull()
  expect(searchCoordinates).toHaveBeenCalledExactlyOnceWith(83.63, -5.39, 7, 0, expect.any(AbortSignal), 'archive')
  expect(window.location.search).toBe('?foo=1&ra=83.63&dec=-5.39&size=7&detector=0')
  expect(window.location.hash).toBe('#frag')
})

it('keeps drafts out of the URL, commits coordinate submissions with any detector, and clears only supported fields', async () => {
  window.history.replaceState({}, '', '/?ra=1&dec=2&detector=3&foo=1#frag')
  mount()
  await flush()
  openSearch()
  edit(83.63, -5.39)
  fireEvent.change(sizeInput(), { target: { value: '12' } })
  expect(new URLSearchParams(window.location.search).get('ra')).toBe('1')
  submit()
  expect(scene.fits.committed).toEqual({ ra: 83.63, dec: -5.39, size: 12, detector: 0 })
  expect(searchCoordinates).toHaveBeenLastCalledWith(83.63, -5.39, 12, 0, expect.any(AbortSignal), 'archive')
  expect(new URLSearchParams(window.location.search).get('detector')).toBe('0')
  await flush()
  click('Clear image and results')
  expect(window.location.search).toBe('?foo=1')
  expect(window.location.hash).toBe('#frag')
})

it('does not commit a sky click until the backend resolves coordinates', async () => {
  const pending = deferred()
  searchImages.mockReturnValueOnce(pending.promise)
  mount()
  click('sky click')
  expect(searchImages).toHaveBeenCalledTimes(1)
  expect(window.location.search).toBe('')
  expect(scene.fits.committed).toBeNull()
  expect(scene.fits.commitPending).toBe(true)
  await act(async () => pending.resolve(result(30, 40)))
  expect(scene.fits.committed).toEqual({ ra: 30, dec: 40, size: 7, detector: 0 })
  expect(window.location.search).toBe('?ra=30&dec=40&size=7&detector=0')
})

it('restores valid popstate entries, aborts stale searches, clears absent ones, and rejects invalid ones without feedback', async () => {
  mount()
  const replace = vi.spyOn(window.history, 'replaceState')
  const pending = deferred()
  searchCoordinates.mockReturnValueOnce(pending.promise)
  navigate('/?ra=10&dec=20&size=9&detector=4')
  expect(searchCoordinates).toHaveBeenLastCalledWith(10, 20, 9, 4, expect.any(AbortSignal), 'archive')
  const signal = searchCoordinates.mock.lastCall[4]
  navigate('/?ra=30&dec=40&size=12&detector=2&foo=1#frag')
  await flush()
  expect(signal.aborted).toBe(true)
  expect(searchCoordinates).toHaveBeenCalledTimes(2)
  expect(searchCoordinates).toHaveBeenLastCalledWith(30, 40, 12, 2, expect.any(AbortSignal), 'archive')
  expect(input('ra').value).toBe('30')
  expect(input('dec').value).toBe('40')
  expect(sizeInput().value).toBe('12')
  await act(async () => pending.resolve(result(10, 20, [{ id: 'stale' }])))
  expect(loadMetadata).not.toHaveBeenCalled()
  expect(scene.fits.committed).toEqual({ ra: 30, dec: 40, size: 12, detector: 2 })
  navigate('/?foo=1#frag')
  expect(scene.fits.committed).toBeNull()
  expect(scene.fits.status).toBe('idle')
  navigate('/?ra=bad&foo=1#frag')
  expect(screen.getByText(invalid)).toBeTruthy()
  expect(document.querySelector('#context-search').getAttribute('aria-hidden')).toBe('false')
  expect(searchCoordinates).toHaveBeenCalledTimes(2)
  expect(searchImages).not.toHaveBeenCalled()
  expect(window.location.search).toBe('?ra=bad&foo=1')
  expect(window.location.hash).toBe('#frag')
  expect(replace).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('removes supported URL fields when the loaded inspector closes', async () => {
  window.history.replaceState({}, '', '/?ra=10&dec=20&size=7&detector=3&foo=1#frag')
  searchCoordinates.mockResolvedValueOnce(result(10, 20, [{ id: metadata.id }]))
  mount()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Close inspector' })).toBeTruthy())
  click('Close inspector')
  expect(scene.fits.committed).toBeNull()
  expect(window.location.search).toBe('?foo=1')
  expect(window.location.hash).toBe('#frag')
})

it('shows history failures globally without discarding the search commit, including Close with the panel closed', async () => {
  mount()
  openSearch()
  vi.spyOn(window.history, 'replaceState').mockImplementation(() => { throw new Error('blocked') })
  edit(10, 20)
  searchCoordinates.mockResolvedValueOnce(result(10, 20, [{ id: metadata.id }]))
  submit()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Close inspector' })).toBeTruthy())
  expect(scene.fits.committed).toEqual({ ra: 10, dec: 20, size: 7, detector: 0 })
  expect(document.querySelector('.status-region').textContent).toContain(historyWarning)
  await waitFor(() => expect(document.querySelector('#context-search').getAttribute('aria-hidden')).toBe('true'))
  click('Close inspector')
  expect(scene.fits.committed).toBeNull()
  expect(document.querySelector('.status-region').textContent).toContain(historyWarning)
})

it('isolates tutorial drafts and searches from the URL and navigation', async () => {
  window.history.replaceState({}, '', '/?ra=10&dec=20&size=12&detector=3')
  const replace = vi.spyOn(window.history, 'replaceState')
  mount(<AppWorkspace tutorial onFinishTour={() => {}} />)
  await flush()
  expect(input('ra').value).toBe('269.4463')
  expect(input('dec').value).toBe('4.7679')
  expect(scene.fits.committed).toBeNull()
  expect(searchCoordinates).not.toHaveBeenCalled()
  await act(async () => { await scene.fits.loadOnboarding() })
  expect(searchCoordinates.mock.lastCall[5]).toBe('onboarding')
  navigate('/?ra=bad')
  expect(screen.queryByText(invalid)).toBeNull()
  expect(searchCoordinates).toHaveBeenCalledTimes(1)
  act(() => scene.fits.reset())
  expect(replace).not.toHaveBeenCalled()
})

it('keeps the real normal workspace mounted without rehydrating the shared search across tour replay', async () => {
  window.history.replaceState({}, '', '/?ra=10&dec=20&size=12&detector=3')
  mount(<AppViewport />)
  await flush()
  const normal = document.querySelector('main:not([data-tutorial])')
  const fitSearch = scene.fits.committed
  // LanguageSelect exposes the explicit replay launcher.
  fireEvent.click(document.querySelector('[data-tour-launcher]'))
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(normal.getAttribute('aria-hidden')).toBe('true')
  click('Skip all')
  await flush()
  expect(document.querySelector('main:not([data-tutorial])')).toBe(normal)
  expect(normal.getAttribute('aria-hidden')).toBeNull()
  expect(scene.fits.committed).toEqual(fitSearch)
  expect(searchCoordinates).toHaveBeenCalledTimes(1)
  expect(scene.normalMounts).toBe(2)
})
