import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import LocationControls from '../../src/components/controls/LocationControls.jsx'
import I18nProvider from '../../src/i18n/I18nProvider.jsx'
import { DEFAULT_OBSERVER } from '../../src/config/location.js'

beforeEach(() => window.localStorage.clear())
const view = (props) => <I18nProvider><LocationControls {...props} /></I18nProvider>

it('fills the default coordinates when the initially unanswered request falls back', () => {
  const props = { observer: null, status: 'loading', error: '', locate: vi.fn(), applyManualLocation: vi.fn(() => true) }
  const { rerender } = render(view(props))
  expect(screen.getByRole('spinbutton', { name: 'Latitude (°)' }).value).toBe('')
  rerender(view({ ...props, observer: DEFAULT_OBSERVER, status: 'ready' }))
  const latitude = screen.getByRole('spinbutton', { name: 'Latitude (°)' })
  const longitude = screen.getByRole('spinbutton', { name: 'Longitude (°)' })
  expect(latitude.value).toBe('51.4779')
  expect(longitude.value).toBe('0')
  expect(screen.getByText(/These coordinates are a reference/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Use device location' }).disabled).toBe(false)
  fireEvent.change(latitude, { target: { value: '19.43' } })
  fireEvent.change(longitude, { target: { value: '-99.13' } })
  fireEvent.submit(latitude.form)
  expect(props.applyManualLocation).toHaveBeenCalledWith(19.43, -99.13)
})
