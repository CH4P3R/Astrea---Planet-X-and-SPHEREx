import { SKY } from '../config/sky.js'
import { prepareSkySnapshot } from '../three/core/starDataUtils.js'
import { apiError } from '../i18n/messages.js'

export async function loadSky(context, signal) {
  const response = await fetch('/api/v1/sky', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ ...context, magnitude_limit: SKY.starMagnitudeLimit, format: 'json' }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw apiError(response.status, error.detail)
  }
  // JSON includes the render metadata in exactly the same order as the directions
  return prepareSkySnapshot(await response.json())
}
