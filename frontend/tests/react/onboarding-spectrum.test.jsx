import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import I18nProvider from '../../src/i18n/I18nProvider.jsx'
import SpectrumPanel from '../../src/components/spectrum/SpectrumPanel.jsx'
import useSpectrum from '../../src/hooks/useSpectrum.js'
import { loadOnboardingSpectrum, onboardingSpectrumPosition } from '../../src/services/onboardingSpectrum.js'
import { barnardQuery } from '../../src/config/onboarding.js'

const image = { requested: barnardQuery }

function Example({ sample = true }) {
  const spectrum = useSpectrum(sample ? loadOnboardingSpectrum : undefined)
  return <I18nProvider><SpectrumPanel spectrum={spectrum} image={image} sample={sample} /></I18nProvider>
}

afterEach(() => vi.unstubAllGlobals())

it('lets beginners explore real example points, hide them and switch methods without archive requests', async () => {
  window.localStorage.clear()
  const fetch = vi.fn(() => { throw new Error('The guide must not contact the archive') })
  vi.stubGlobal('fetch', fetch)
  render(<Example />)
  expect(screen.getByText(/point near Barnard/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'D1', exact: true }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'D3', exact: true }))
  await waitFor(() => expect(document.querySelectorAll('.spectrum-point').length).toBe(2))
  expect(screen.getByText(/RA 269.44446°/)).toBeTruthy()
  fireEvent.focus(document.querySelector('.spectrum-hit'))
  expect(document.querySelector('.spectrum-readout').textContent).toContain('2025')
  expect(document.querySelector('.spectrum-readout').textContent).toContain('±')
  // The two examples have no trend line; do not describe one or label both points doubtful.
  expect(document.querySelector('.spectrum-trend')).toBeNull()
  expect(document.querySelector('.spectrum-warning')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'D3', exact: true }))
  expect(document.querySelector('.spectrum-chart')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'D3', exact: true }))
  await screen.findByRole('img')
  fireEvent.click(screen.getByRole('button', { name: 'Aperture', exact: true }))
  await waitFor(() => expect(document.querySelector('.spectrum-chart')).toBeNull())
  fireEvent.click(screen.getByRole('button', { name: 'D3', exact: true }))
  await waitFor(() => expect(document.querySelectorAll('.spectrum-point').length).toBe(2))
  expect(screen.getByText(/3-pixel aperture/)).toBeTruthy()
  expect(fetch).not.toHaveBeenCalled()
})

it('keeps the normal spectrum on the selected sky position and the live archive', async () => {
  window.localStorage.clear()
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ points: [], exposures: { found: 0 } }) })
  vi.stubGlobal('fetch', fetch)
  render(<Example sample={false} />)
  expect(screen.getByRole('button', { name: 'D1', exact: true }).disabled).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'D1', exact: true }))
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  const params = new URL(fetch.mock.calls[0][0], 'http://localhost').searchParams
  expect(Number(params.get('ra_deg'))).toBe(barnardQuery.ra_deg)
  expect(Number(params.get('dec_deg'))).toBe(barnardQuery.dec_deg)
  expect(params.get('detector')).toBe('1')
  expect(screen.queryByText(/point near Barnard/)).toBeNull()
})

it('rejects unsupported example positions and honours cancellation', async () => {
  const { ra_deg: ra, dec_deg: dec } = onboardingSpectrumPosition
  await expect(loadOnboardingSpectrum(barnardQuery.ra_deg, barnardQuery.dec_deg, 3, 'psf')).rejects.toThrow(RangeError)
  const controller = new AbortController()
  controller.abort()
  await expect(loadOnboardingSpectrum(ra, dec, 3, 'psf', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
})
