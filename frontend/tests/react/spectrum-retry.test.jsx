import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import I18nProvider from '../../src/i18n/I18nProvider.jsx'
import SpectrumPanel from '../../src/components/spectrum/SpectrumPanel.jsx'
import useSpectrum from '../../src/hooks/useSpectrum.js'

const image = { requested: { ra_deg: 42, dec_deg: 15 } }
const point = {
  source_url: 'https://example.org/observation.fits', detector: 1,
  observed_utc: '2025-10-01T00:00:00Z', wavelength_um: 1, bandwidth_um: 0.02,
  flux_ujy: 20, flux_error_ujy: 2, flags: [], bad_pixels: 0, crowded: false,
}
const response = (points, failed = 0) => ({
  points,
  exposures: { found: points.length + failed, measured: points.length, skipped: 0, failed },
})

function Example({ load }) {
  const spectrum = useSpectrum(load)
  return <I18nProvider><SpectrumPanel spectrum={spectrum} image={image} /></I18nProvider>
}

beforeEach(() => window.localStorage.clear())

it('distinguishes archive failures from an unmeasurable source and retries a successful but empty response', async () => {
  const load = vi.fn()
    .mockResolvedValueOnce(response([], 2))
    .mockResolvedValueOnce(response([point]))
  render(<Example load={load} />)
  fireEvent.click(screen.getByRole('button', { name: 'D1', exact: true }))
  const retry = await screen.findByRole('button', { name: 'Retry D1' })
  expect(screen.getByText(/Some exposures of D1 could not be retrieved/)).toBeTruthy()
  expect(screen.queryByText(/No exposure of D1 could measure/)).toBeNull()
  fireEvent.click(retry)
  await screen.findByRole('img')
  expect(load).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('button', { name: 'Retry D1' })).toBeNull()
})

it('keeps a partial chart during a retry and after an error, without refetching when hidden and shown', async () => {
  let rejectRetry
  const load = vi.fn()
    .mockResolvedValueOnce(response([point], 1))
    .mockImplementationOnce(() => new Promise((_, reject) => { rejectRetry = reject }))
    .mockResolvedValueOnce(response([point, { ...point, source_url: 'second.fits', wavelength_um: 1.1 }]))
  render(<Example load={load} />)
  const detector = screen.getByRole('button', { name: 'D1', exact: true })
  fireEvent.click(detector)
  await screen.findByRole('img')
  fireEvent.click(detector)
  expect(screen.queryByRole('img')).toBeNull()
  fireEvent.click(detector)
  expect(screen.getByRole('img')).toBeTruthy()
  expect(load).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Retry D1' }))
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
  expect(screen.getByRole('img')).toBeTruthy()
  rejectRetry(new Error('Archive unavailable'))
  await screen.findByRole('alert')
  expect(screen.getByRole('img')).toBeTruthy()
  fireEvent.click(detector)
  expect(screen.queryByRole('img')).toBeNull()
  fireEvent.click(detector)
  expect(screen.getByRole('img')).toBeTruthy()
  expect(load).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: 'Retry D1' }))
  await waitFor(() => expect(document.querySelectorAll('.spectrum-point')).toHaveLength(2))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Retry D1' })).toBeNull()
})

it('does not offer archive retries for a completed search with no measurable points', async () => {
  const load = vi.fn().mockResolvedValue({ points: [], exposures: { found: 2, measured: 0, skipped: 2, failed: 0 } })
  render(<Example load={load} />)
  fireEvent.click(screen.getByRole('button', { name: 'D1', exact: true }))
  await screen.findByText(/No exposure of D1 could measure/)
  expect(screen.queryByRole('button', { name: 'Retry D1' })).toBeNull()
})

it('leaves a gap in the guide line where sparse measurements provide no local support', async () => {
  const sparse = [1, 1.01, 1.5].map((wavelength_um, index) => ({
    ...point, wavelength_um, bandwidth_um: 0.001, source_url: `${index}.fits`,
  }))
  const load = vi.fn().mockResolvedValue(response(sparse))
  render(<Example load={load} />)
  fireEvent.click(screen.getByRole('button', { name: 'D1', exact: true }))
  await screen.findByRole('img')
  const path = document.querySelector('.spectrum-trend').getAttribute('d')
  expect(path).not.toMatch(/NaN|Infinity/)
  expect(path.match(/M/g).length).toBeGreaterThan(1)
  expect(document.querySelectorAll('.spectrum-point')).toHaveLength(3)
})
