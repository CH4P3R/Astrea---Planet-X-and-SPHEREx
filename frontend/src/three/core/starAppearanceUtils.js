import { SKY } from '../../config/sky.js'
import { baseOrthographicZoom } from './skyViewUtils.js'

// Catalog magnitude controls a screen symbol, not a star's physical diameter.
export function starAppearance(apparentMagnitude) {
  const light = Math.min(1, 10 ** (-0.15 * (apparentMagnitude + 1.5)))
  // Emphasise bright sky landmarks, including moderately bright stars that
  // help recognizable patterns stand out. Smoothly fade the extra 2.2 pixels
  // to zero at magnitude 4, keeping the faint background unchanged.
  const weight = Math.min(1, Math.max(0, (4 - apparentMagnitude) / 3))
  const prominence = weight * weight * (3 - 2 * weight)
  return { diameter: 1.8 + 5.2 * light + 2.2 * prominence, brightness: 0.45 + 0.55 * light }
}

export function starZoomScale(cameraZoom, width, height) {
  const relativeZoom = cameraZoom / baseOrthographicZoom(width, height)
  const zoom = Math.min(SKY.maxZoom, Math.max(SKY.minZoom, relativeZoom))
  // Gentle growth preserves recognizable stars without filling a FITS view
  // with giant catalog markers at the camera's largest zoom levels.
  return Math.min(2, Math.max(0.9, 1 + 0.18 * Math.log2(zoom)))
}
