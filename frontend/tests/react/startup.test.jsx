import { useEffect } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AppViewport from '../../src/components/layout/AppViewport.jsx'
import I18nProvider from '../../src/i18n/I18nProvider.jsx'
import { initialTourOpen } from '../../src/share/startup.js'
import { tourStorageKey } from '../../src/components/onboarding/tourState.js'

const mounts = vi.hoisted(() => ({ normal: 0 }))
vi.mock('../../src/components/layout/AppWorkspace.jsx', () => ({
  default: function Workspace({ tutorial, suspended, onStartTour, onFinishTour }) {
    useEffect(() => { if (!tutorial) mounts.normal += 1 }, [tutorial])
    return tutorial ? <div>tutorial workspace<button onClick={() => onFinishTour('completed')}>finish</button></div>
      : <main aria-hidden={suspended}><button onClick={onStartTour}>start tour</button></main>
  },
}))

beforeEach(() => { window.localStorage.clear(); mounts.normal = 0 })
afterEach(() => vi.restoreAllMocks())

it('suppresses automatic onboarding for valid and invalid shared links without storing a status', () => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  expect(initialTourOpen('https://astrea.test/?ra=1&dec=2', storage)).toBe(false)
  expect(initialTourOpen('https://astrea.test/?ra=bad', storage)).toBe(false)
  expect(values.size).toBe(0)
  expect(initialTourOpen('https://astrea.test/', storage)).toBe(true)
  values.set(tourStorageKey, 'completed')
  expect(initialTourOpen('https://astrea.test/?foo=1', storage)).toBe(false)
})

it('falls back to ordinary onboarding for parse and storage failures', () => {
  expect(initialTourOpen('not a URL', { getItem: () => 'skipped' })).toBe(false)
  expect(initialTourOpen('https://astrea.test/', { getItem: () => { throw new Error('blocked') } })).toBe(true)
})

it.each(['/?ra=1&dec=2', '/?ra=bad'])('keeps normal workspace mounted across explicit replay for %s', (href) => {
  window.history.replaceState({}, '', href)
  render(<I18nProvider><AppViewport /></I18nProvider>)
  expect(screen.queryByText('tutorial workspace')).toBeNull()
  expect(window.localStorage.getItem(tourStorageKey)).toBeNull()
  for (let replay = 0; replay < 2; replay++) {
    fireEvent.click(screen.getByRole('button', { name: 'start tour' }))
    expect(screen.getByText('tutorial workspace')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'finish' }))
    expect(screen.queryByText('tutorial workspace')).toBeNull()
  }
  expect(mounts.normal).toBe(1)
})

it.each([['/', true], ['/?ra=1&dec=2', false], ['/?ra=bad', false]])(
  'handles a throwing storage getter at startup for %s', (href, starts) => {
    window.history.replaceState({}, '', href)
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked') })
    render(<I18nProvider><AppViewport /></I18nProvider>)
    expect(Boolean(screen.queryByText('tutorial workspace'))).toBe(starts)
  },
)
