import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import I18nProvider from '../../src/i18n/I18nProvider.jsx'
import PlaybackControls from '../../src/components/blink-hud/PlaybackControls.jsx'

beforeEach(() => window.localStorage.clear())

const playback = () => ({ previous: vi.fn(), next: vi.fn(), pause: vi.fn(), toggle: vi.fn(),
  playing: false, interval: 0.7, setInterval: vi.fn() })
const view = (controls, reason = '') => <I18nProvider>
  <PlaybackControls playback={controls} reason={reason} frames={[{}, {}]} />
</I18nProvider>

it('uses the shared SVG for both directions and preserves navigation callbacks', () => {
  const controls = playback()
  const { container } = render(view(controls))
  const icons = container.querySelectorAll('.comparison-arrow')
  expect(icons.length).toBe(2)
  expect(icons[0].getAttribute('viewBox')).toBe('0 0 15 15')
  expect(icons[0].getAttribute('aria-hidden')).toBe('true')
  expect(icons[0].classList.contains('comparison-arrow--previous')).toBe(true)
  expect(icons[1].classList.contains('comparison-arrow--previous')).toBe(false)
  fireEvent.click(icons[0].closest('button'))
  fireEvent.click(icons[1].closest('button'))
  expect(controls.previous).toHaveBeenCalledTimes(1)
  expect(controls.next).toHaveBeenCalledTimes(1)
  expect(screen.getAllByRole('button').every((button) => button.getAttribute('aria-label') || button.textContent)).toBe(true)
})

it('keeps both arrow actions blocked when comparison is unavailable', () => {
  const controls = playback()
  const { container } = render(view(controls, 'inspector.compare.needPartner'))
  for (const icon of container.querySelectorAll('.comparison-arrow')) {
    const button = icon.closest('button')
    expect(button.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(button)
  }
  expect(controls.previous).not.toHaveBeenCalled()
  expect(controls.next).not.toHaveBeenCalled()
})
