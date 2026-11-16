import { apiError } from '../i18n/messages.js'

// One point per exposure the detector took of the position; `method` is 'aperture' or 'psf'.
export async function loadSpectrum(ra, dec, detector, method, signal) {
  const query = new URLSearchParams({ ra_deg: ra, dec_deg: dec, detector, method })
  const response = await fetch(`/api/v1/spectrum?${query}`, { signal })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw apiError(response.status, error.detail)
  }
  return response.json()
}
