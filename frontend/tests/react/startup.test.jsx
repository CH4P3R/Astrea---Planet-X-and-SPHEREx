import { useEffect } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AppViewport from '../../src/components/layout/AppViewport.jsx'
import I18nProvider from '../../src/i18n/I18nProvider.jsx'
import { initialTourOpen } from '../../src/share/startup.js'
import { tourStorageKey } from '../../src/components/onboarding/tourState.js'

const mounts = vi.hoisted(() => ({ normal: 0 }))
vi.mock('../../src/components/onboarding/WelcomeModal.jsx', () => ({
  default: ({ onExplore, onTutorial, onExited, closing, visible }) => <div data-testid="welcome" data-closing={closing} data-visible={visible}>
    welcome modal
    <button onClick={onExplore}>explore</button>
    <button onClick={onTutorial}>tutorial</button>
    <button onClick={onExited}>exit complete</button>
  </div>,
}))
vi.mock('../../src/components/onboarding/StartupSplash.jsx', () => ({
  default: ({ onReveal, onFinish }) => <div data-testid="startup">
    <button onClick={onReveal}>reveal welcome</button>
    <button onClick={onFinish}>load complete</button>
  </div>,
}))
vi.mock('../../src/components/layout/AppWorkspace.jsx', () => ({
  default: function Workspace({ tutorial, suspended, covered, revealing, onStartTour, onFinishTour }) {
    useEffect(() => { if (!tutorial) mounts.normal += 1 }, [tutorial])
    return tutorial ? <div data-testid="tutorial" data-revealing={revealing}>tutorial workspace<button onClick={() => onFinishTour('completed')}>finish</button></div>
      : <main aria-hidden={suspended} data-covered={covered} data-revealing={revealing}><button onClick={onStartTour}>start tour</button></main>
  },
}))

beforeEach(() => { window.localStorage.clear(); mounts.normal = 0 })
afterEach(() => vi.restoreAllMocks())

it.each(['explore', 'tutorial'])('keeps the scene active and HUD covered until welcome exit completes for %s', (destination) => {
  window.history.replaceState({}, '', '/')
  render(<I18nProvider><AppViewport /></I18nProvider>)
  const normal = document.querySelector('main')
  expect(normal.getAttribute('aria-hidden')).toBe('false')
  expect(normal.dataset.covered).toBe('true')
  const welcome = screen.getByTestId('welcome')
  expect(welcome.dataset.visible).toBe('false')
  fireEvent.click(screen.getByRole('button', { name: 'reveal welcome' }))
  expect(screen.getByTestId('welcome')).toBe(welcome)
  expect(welcome.dataset.visible).toBe('true')
  expect(screen.getByTestId('startup')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'load complete' }))
  expect(screen.queryByTestId('startup')).toBeNull()
  expect(screen.getByTestId('welcome')).toBe(welcome)
  expect(welcome.dataset.visible).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: destination, exact: true }))
  expect(screen.getByTestId('welcome').dataset.closing).toBe('true')
  expect(normal.dataset.covered).toBe('true')
  expect(screen.queryByText('tutorial workspace')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'exit complete' }))
  expect(screen.queryByTestId('welcome')).toBeNull()
  const destinationWorkspace = destination === 'explore' ? normal : screen.getByTestId('tutorial')
  expect(destinationWorkspace.dataset.revealing).toBe('true')
  if (destination === 'explore') expect(normal.dataset.covered).toBe('false')
  expect(mounts.normal).toBe(1)
})

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
    expect(screen.queryByText('tutorial workspace')).toBeNull()
    expect(Boolean(screen.queryByText('welcome modal'))).toBe(starts)
  },
)
