import { apiError } from '../i18n/messages.js'

const API = '/api/v1/images'

async function request(path, { signal, body } = {}) {
  const response = await fetch(`${API}${path}`, {
    signal,
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw apiError(response.status, error.detail)
  }
  return response
}

export const observerContext = (observer, timeContext = { mode: 'live' }) => ({
  observer: { latitude_deg: observer.latitude, longitude_deg: observer.longitude, elevation_m: 0 },
  at: timeContext.at ?? new Date().toISOString(),
  mode: timeContext.mode,
})

// Only the most recent observation is requested; `detector` (1–6) narrows it to one array.
export async function searchImages(context, direction, size, detector, signal) {
  return (await request('/search', { signal, body: {
    ...context, direction, size_arcmin: size, limit: 1, ...(detector ? { detector } : {}),
  } })).json()
}

export async function searchCoordinates(ra, dec, size, detector, signal) {
  const query = new URLSearchParams({ ra_deg: ra, dec_deg: dec, size_deg: size / 60, limit: 1 })
  if (detector) query.set('detector', detector)
  return (await request(`?${query}`, { signal })).json()
}

export async function loadMetadata(id, signal) {
  return (await request(`/load/${id}`, { signal, body: {} })).json()
}

export async function loadPixels(id, signal) {
  return (await request(`/${id}/pixels`, { signal })).arrayBuffer()
}

export async function loadProjection(id, context, signal) {
  return (await request(`/${id}/projection`, { signal, body: context })).json()
}
