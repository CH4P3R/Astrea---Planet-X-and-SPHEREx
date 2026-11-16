import { StrictMode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import useObserver from '../../src/hooks/useObserver.js'
import { DEFAULT_OBSERVER, LOCATION_TIMEOUT_MS } from '../../src/config/location.js'

let success, failure
const getCurrentPosition = vi.fn()
beforeEach(() => {
  vi.useFakeTimers()
  getCurrentPosition.mockReset()
  getCurrentPosition.mockImplementation((onSuccess, onFailure) => { success = onSuccess; failure = onFailure })
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const start = () => act(() => vi.advanceTimersByTime(0))

it('assigns a default after an unanswered request and ignores late browser callbacks', () => {
  const { result } = renderHook(() => useObserver())
  start()
  act(() => vi.advanceTimersByTime(LOCATION_TIMEOUT_MS - 1))
  expect(result.current.observer).toBeNull()
  act(() => vi.advanceTimersByTime(1))
  expect(result.current.observer).toEqual(DEFAULT_OBSERVER)
  expect(result.current.status).toBe('ready')
  expect(result.current.error).toBe('')
  expect(result.current.notice.message).toBe('location.notices.defaultAssigned')
  act(() => {
    success({ coords: { latitude: 10, longitude: 20 } })
    failure({ code: 1 })
  })
  expect(result.current.observer).toEqual(DEFAULT_OBSERVER)
})

it.each([1, 2, 3])('assigns a default when geolocation fails with code %s', (code) => {
  const { result } = renderHook(() => useObserver())
  start()
  act(() => failure({ code }))
  expect(result.current.observer).toEqual(DEFAULT_OBSERVER)
  expect(result.current.notice.status).toBe('warning')
})

it.each(['insecure', 'unsupported', 'throws'])('assigns a default when geolocation is %s', (mode) => {
  if (mode === 'insecure') vi.stubGlobal('isSecureContext', false)
  if (mode === 'unsupported') vi.stubGlobal('navigator', {})
  if (mode === 'throws') getCurrentPosition.mockImplementation(() => { throw new Error('unavailable') })
  const { result } = renderHook(() => useObserver())
  start()
  expect(result.current.observer).toEqual(DEFAULT_OBSERVER)
})

it('uses an accepted device location without a fallback', () => {
  const { result } = renderHook(() => useObserver())
  start()
  act(() => success({ coords: { latitude: 10, longitude: 20 } }))
  act(() => vi.advanceTimersByTime(LOCATION_TIMEOUT_MS))
  expect(result.current.observer).toEqual({ latitude: 10, longitude: 20, source: 'device' })
  expect(result.current.notice).toBeNull()
})

it('manual coordinates take priority over pending callbacks and the fallback deadline', () => {
  const { result } = renderHook(() => useObserver())
  start()
  act(() => result.current.applyManualLocation(19.43, -99.13))
  act(() => {
    success({ coords: { latitude: 10, longitude: 20 } })
    failure({ code: 1 })
    vi.advanceTimersByTime(LOCATION_TIMEOUT_MS)
  })
  expect(result.current.observer).toEqual({ latitude: 19.43, longitude: -99.13, source: 'manual' })
  expect(result.current.notice).toBeNull()
})

it('permits an explicit device retry after fallback and clears its notice on success', () => {
  const { result } = renderHook(() => useObserver())
  start()
  act(() => failure({ code: 1 }))
  act(() => result.current.locate())
  act(() => success({ coords: { latitude: 10, longitude: 20 } }))
  expect(result.current.observer.source).toBe('device')
  expect(result.current.notice).toBeNull()
})

it('retains an existing location when a retry fails', () => {
  const { result } = renderHook(() => useObserver())
  start()
  act(() => result.current.applyManualLocation(19.43, -99.13))
  act(() => result.current.locate())
  act(() => failure({ code: 1 }))
  expect(result.current.observer.source).toBe('manual')
  expect(result.current.error).toBe('location.errors.denied')
  expect(result.current.notice).toBeNull()
})

it('does not change tutorial or shared-link observers when automatic location is disabled', () => {
  const initialObserver = { latitude: 51.4779, longitude: 0, source: 'reference' }
  const { result } = renderHook(() => useObserver({ initialObserver, automatic: false }))
  act(() => vi.advanceTimersByTime(LOCATION_TIMEOUT_MS * 2))
  expect(getCurrentPosition).not.toHaveBeenCalled()
  expect(result.current.observer).toEqual(initialObserver)
  expect(result.current.notice).toBeNull()
})

it('cancels timers on unmount and starts only one request in Strict Mode', () => {
  const { unmount } = renderHook(() => useObserver(), { wrapper: StrictMode })
  start()
  expect(getCurrentPosition).toHaveBeenCalledTimes(1)
  unmount()
  expect(vi.getTimerCount()).toBe(0)
  act(() => failure({ code: 1 }))
})
