import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AppViewport from '../../src/components/layout/AppViewport.jsx'
import I18nProvider from '../../src/i18n/I18nProvider.jsx'
import { languageStorageKey } from '../../src/i18n/core.js'
import { projectRepository, teamMembers } from '../../src/config/team.js'
import { welcomeStorageKey } from '../../src/components/onboarding/welcomeState.js'
import LanguageSelect from '../../src/components/controls/LanguageSelect.jsx'

vi.mock('../../src/components/layout/AppWorkspace.jsx', () => ({
  default: ({ covered, onOpenAbout, onStartTour }) => <main className="app-viewport" tabIndex={-1} data-covered={covered} inert={covered}>
    <div className="scene-layer" />
    <div className="ui-layer"><LanguageSelect onOpenAbout={onOpenAbout} onStartTour={onStartTour} suspended={covered} /></div>
  </main>,
}))

let originalShowModal
let originalClose

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
  const prototype = HTMLDialogElement.prototype
  originalShowModal = Object.getOwnPropertyDescriptor(prototype, 'showModal')
  originalClose = Object.getOwnPropertyDescriptor(prototype, 'close')
  Object.defineProperty(prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
})

afterEach(() => {
  cleanup()
  const prototype = HTMLDialogElement.prototype
  if (originalShowModal) Object.defineProperty(prototype, 'showModal', originalShowModal)
  else delete prototype.showModal
  if (originalClose) Object.defineProperty(prototype, 'close', originalClose)
  else delete prototype.close
  vi.useRealTimers()
})

it.each([false, true])('reveals the same welcome once under an independent startup layer, StrictMode=%s', (strict) => {
  const app = <I18nProvider><AppViewport /></I18nProvider>
  render(strict ? <StrictMode>{app}</StrictMode> : app)
  const welcome = document.querySelector('.welcome-modal')
  const splash = document.querySelector('.startup-splash')
  const workspace = document.querySelector('main')
  expect(welcome.parentElement).toBe(document.body)
  expect(splash.parentElement).toBe(document.body)
  expect(welcome.contains(splash)).toBe(false)
  expect(welcome.classList.contains('welcome-modal--concealed')).toBe(true)
  act(() => vi.advanceTimersByTime(1400))
  expect(splash.dataset.fading).toBe('true')
  expect(document.querySelector('.welcome-modal')).toBe(welcome)
  expect(welcome.classList.contains('welcome-modal--concealed')).toBe(false)
  expect(welcome.querySelector('.modal__content').hasAttribute('inert')).toBe(true)
  act(() => vi.advanceTimersByTime(500))
  expect(document.querySelector('.startup-splash')).toBeNull()
  expect(document.querySelector('.welcome-modal')).toBe(welcome)
  expect(welcome.classList.contains('welcome-modal--concealed')).toBe(false)
  expect(welcome.querySelector('.modal__content').hasAttribute('inert')).toBe(false)
  expect(document.querySelector('main')).toBe(workspace)
  expect(workspace.dataset.covered).toBe('true')
})

it('changes welcome language using the shared selector inside the native dialog layer', () => {
  render(<I18nProvider><AppViewport /></I18nProvider>)
  const welcome = document.querySelector('.welcome-modal')
  const selector = within(welcome).getByRole('combobox', { hidden: true })
  expect(selector.disabled).toBe(true)
  act(() => vi.advanceTimersByTime(1900))
  expect(selector.disabled).toBe(false)
  const list = document.getElementById(selector.getAttribute('aria-controls'))
  expect(list.parentElement).toBe(welcome)
  for (const option of list.querySelectorAll('[role="option"]')) option.scrollIntoView = vi.fn()
  fireEvent.click(selector)
  fireEvent.click(within(list).getByRole('option', { name: 'Español' }))
  expect(within(welcome).getByRole('heading', { level: 1 }).textContent).toBe('Bienvenido a Astrea')
  expect(within(welcome).getByRole('button', { name: 'Empezar a explorar' })).toBeTruthy()
  expect(window.localStorage.getItem(languageStorageKey)).toBe('es')
  expect(document.querySelector('.welcome-modal')).toBe(welcome)
  expect(selector.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(selector)
  fireEvent.keyDown(selector, { key: 'Escape' })
  expect(selector.getAttribute('aria-expanded')).toBe('false')
  expect(welcome.hasAttribute('data-closing')).toBe(false)
})

it('keeps about out of the welcome dialog', () => {
  render(<I18nProvider><AppViewport /></I18nProvider>)
  const welcome = document.querySelector('.welcome-modal')
  expect(within(welcome).queryByRole('button', { name: 'About Astrea', hidden: true })).toBeNull()
  expect(document.querySelector('.about-modal')).toBeNull()
})

it('opens a dedicated about dialog from the HUD utility row with GitHub links', () => {
  window.localStorage.setItem(welcomeStorageKey, 'seen')
  render(<I18nProvider><AppViewport /></I18nProvider>)
  const hud = document.querySelector('.ui-layer')
  const trigger = within(hud).getByRole('button', { name: 'About Astrea' })
  const language = within(hud).getByRole('combobox')
  const actions = hud.querySelector('.language-actions')
  expect(actions.contains(trigger)).toBe(true)
  expect(actions.querySelector('[data-tour-launcher]')).toBeTruthy()
  expect(trigger.textContent).toBe('')
  expect(actions.nextElementSibling.contains(language)).toBe(true)
  trigger.focus()
  fireEvent.click(trigger)
  const dialog = document.querySelector('.about-modal')
  expect(dialog.dataset.size).toBe('large')
  expect(document.querySelector('.welcome-modal')).toBeNull()
  expect(document.querySelectorAll('dialog[open]').length).toBe(1)
  const about = dialog.querySelector('.about-content')
  expect(within(about).getByRole('heading', { level: 1 }).textContent).toBe('About Astrea')
  expect(within(about).getAllByRole('img').length).toBe(6)
  for (const member of teamMembers) {
    const profile = within(about).getByRole('link', { name: `${member.name} on GitHub (opens in a new tab)` })
    expect(profile.getAttribute('href')).toBe(member.profile)
    expect(profile.getAttribute('target')).toBe('_blank')
    expect(profile.getAttribute('rel')).toBe('noopener noreferrer')
    expect(profile.querySelector('svg')).toBeTruthy()
    const row = profile.closest('li')
    expect(row.querySelector('img').getAttribute('src')).toBe(member.photo)
    expect(row.querySelector('[lang="en"]').textContent).toBe(member.role)
  }
  const repository = within(about).getByRole('link', { name: 'View the project on GitHub (opens in a new tab)' })
  expect(repository.getAttribute('href')).toBe(projectRepository)
  expect(repository.querySelectorAll('svg').length).toBe(2)
  const close = within(dialog).getByRole('button', { name: 'Close' })
  expect(document.activeElement).toBe(close)
  fireEvent.click(close)
  act(() => vi.advanceTimersByTime(1000))
  expect(document.querySelector('.about-modal')).toBeNull()
  expect(document.activeElement).toBe(document.querySelector('.app-viewport'))
  fireEvent.click(trigger)
  fireEvent(document.querySelector('.about-modal'), new Event('cancel', { cancelable: true }))
  act(() => vi.advanceTimersByTime(1000))
  expect(document.querySelector('.about-modal')).toBeNull()
  expect(window.localStorage.getItem(welcomeStorageKey)).toBe('seen')
})
