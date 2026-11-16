import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import I18nProvider from '../../src/i18n/I18nProvider.jsx'
import ShareLink from '../../src/share/ShareLink.jsx'

let clipboardDescriptor
const hrefA = 'https://astrea.test/?ra=1&dec=2&size=7&detector=0'
const hrefB = 'https://astrea.test/?ra=3&dec=4&size=7&detector=0'
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const clipboard = (writeText) => Object.defineProperty(navigator, 'clipboard', {
  configurable: true, value: { writeText },
})
const view = (props) => <I18nProvider><ShareLink {...props} /></I18nProvider>
const button = () => screen.getByRole('button', { name: 'Copy link' })

beforeEach(() => {
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  window.localStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
  else delete navigator.clipboard
})

it('shows the share icon and confirms successful copying in a temporary tooltip', async () => {
  vi.useFakeTimers()
  const writeText = vi.fn().mockResolvedValue()
  clipboard(writeText)
  render(view({ getHref: () => hrefA, disabled: false, iconOnly: true }))
  expect(button().querySelector('svg')).toBeTruthy()
  expect(button().textContent).toBe('')
  fireEvent.click(button())
  await act(async () => {})
  expect(writeText).toHaveBeenCalledWith(hrefA)
  expect(screen.getByRole('tooltip').textContent).toBe('Link copied')
  expect(screen.getByRole('tooltip').dataset.open).toBe('true')
  act(() => vi.advanceTimersByTime(2400))
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getByRole('tooltip').textContent).toBe('Copy link')
})

it('does not claim success when copying from the icon fails', async () => {
  clipboard(vi.fn().mockRejectedValue(new Error('denied')))
  render(view({ getHref: () => hrefA, disabled: false, iconOnly: true }))
  fireEvent.click(button())
  await act(async () => {})
  expect(screen.getByRole('tooltip').textContent).toBe('Copy this link manually.')
  expect(screen.getByLabelText('Share link').value).toBe(hrefA)
  expect(screen.queryByText('Link copied')).toBeNull()
})

it('builds a fresh link on every click and announces success only after resolution without moving focus', async () => {
  const pending = deferred()
  const writeText = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue()
  clipboard(writeText)
  let href = hrefA
  render(view({ getHref: () => href, disabled: false }))
  button().focus()
  fireEvent.click(button())
  expect(writeText).toHaveBeenLastCalledWith(hrefA)
  expect(screen.queryByRole('status')).toBeNull()
  await act(async () => pending.resolve())
  expect(screen.getByRole('status').textContent).toBe('Link copied')
  expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite')
  expect(document.activeElement).toBe(button())
  href = hrefB
  fireEvent.click(button())
  await act(async () => {})
  expect(writeText).toHaveBeenLastCalledWith(hrefB)
  expect(writeText).toHaveBeenCalledTimes(2)
  expect(document.activeElement).toBe(button())
})

it.each(['missing', 'denied'])('offers a labeled read-only selectable fallback when clipboard is %s without stealing focus', async (mode) => {
  if (mode === 'missing') delete navigator.clipboard
  else clipboard(vi.fn().mockRejectedValue(new Error('denied')))
  render(view({ getHref: () => hrefA, disabled: false }))
  button().focus()
  fireEvent.click(button())
  await act(async () => {})
  const input = screen.getByLabelText('Share link')
  expect(input.value).toBe(hrefA)
  expect(input.readOnly).toBe(true)
  expect(screen.queryByText('Link copied')).toBeNull()
  expect(screen.getByRole('status').textContent).toBe('Copy this link manually.')
  expect(document.activeElement).toBe(button())
  act(() => input.focus())
  expect(document.activeElement).toBe(input)
  expect(input.selectionStart).toBe(0)
  expect(input.selectionEnd).toBe(hrefA.length)
})

it.each([
  { disabled: true, href: hrefA },
  { disabled: false, href: '' },
  { disabled: false, href: null },
])('does not copy or announce for disabled/empty links: %j', async ({ disabled, href }) => {
  const writeText = vi.fn()
  clipboard(writeText)
  render(view({ getHref: () => href, disabled }))
  expect(button().disabled).toBe(disabled)
  fireEvent.click(button())
  await act(async () => {})
  expect(writeText).not.toHaveBeenCalled()
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.queryByRole('textbox')).toBeNull()
})

it.each(['success', 'fallback'])('clears obsolete %s feedback when the committed callback changes or sharing becomes disabled', async (mode) => {
  clipboard(mode === 'success' ? vi.fn().mockResolvedValue() : vi.fn().mockRejectedValue(new Error('denied')))
  const first = () => hrefA
  const second = () => hrefB
  const { rerender } = render(view({ getHref: first, disabled: false }))
  fireEvent.click(button())
  await act(async () => {})
  expect(screen.getByRole('status')).toBeTruthy()
  rerender(view({ getHref: second, disabled: false }))
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.queryByRole('textbox')).toBeNull()
  fireEvent.click(button())
  await act(async () => {})
  expect(screen.getByRole('status')).toBeTruthy()
  rerender(view({ getHref: second, disabled: true }))
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.queryByRole('textbox')).toBeNull()
  rerender(view({ getHref: second, disabled: false }))
  expect(screen.queryByRole('status')).toBeNull()
})

it.each(['resolve', 'reject'])('ignores stale clipboard %s after a changed commit, disabled state, or newer click', async (outcome) => {
  const first = deferred()
  const second = deferred()
  const third = deferred()
  clipboard(vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise))
  const getHref = () => hrefA
  const nextHref = () => hrefB
  const { rerender } = render(view({ getHref, disabled: false }))
  fireEvent.click(button())
  rerender(view({ getHref: nextHref, disabled: false }))
  await act(async () => first[outcome](new Error('denied')))
  expect(screen.queryByRole('status')).toBeNull()
  fireEvent.click(button())
  rerender(view({ getHref: nextHref, disabled: true }))
  await act(async () => second[outcome](new Error('denied')))
  expect(screen.queryByRole('status')).toBeNull()
  rerender(view({ getHref: nextHref, disabled: false }))
  fireEvent.click(button())
  clipboard(vi.fn().mockResolvedValue())
  fireEvent.click(button())
  await act(async () => {})
  expect(screen.getByRole('status').textContent).toBe('Link copied')
  await act(async () => third[outcome](new Error('denied')))
  expect(screen.getByRole('status').textContent).toBe('Link copied')
  expect(screen.queryByRole('textbox')).toBeNull()
})
