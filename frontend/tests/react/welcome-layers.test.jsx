import { StrictMode } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AppViewport from '../../src/components/layout/AppViewport.jsx'
import I18nProvider from '../../src/i18n/I18nProvider.jsx'

vi.mock('../../src/components/layout/AppWorkspace.jsx', () => ({
  default: ({ covered }) => <main data-covered={covered}><div className="scene-layer" /><div className="ui-layer" /></main>,
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
