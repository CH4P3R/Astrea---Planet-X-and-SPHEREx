import { SKY } from '../../config/sky.js'
import { baseOrthographicZoom } from './skyViewUtils.js'

// Catalog magnitude controls a screen symbol, not a star's physical diameter.
export function starAppearance(apparentMagnitude) {
  const light = Math.min(1, 10 ** (-0.15 * (apparentMagnitude + 1.5)))
  return { diameter: 1.8 + 5.2 * light, brightness: 0.45 + 0.55 * light }
}

export function starZoomScale(cameraZoom, width, height) {
  const relativeZoom = cameraZoom / baseOrthographicZoom(width, height)
  const zoom = Math.min(SKY.maxZoom, Math.max(SKY.minZoom, relativeZoom))
  // Gentle growth preserves recognizable stars without filling a FITS view
  // with giant catalog markers at the camera's largest zoom levels.
  return Math.min(2, Math.max(0.9, 1 + 0.18 * Math.log2(zoom)))
}
