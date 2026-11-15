import { SKY } from '../../config/sky.js'

export function baseOrthographicZoom(width, height) {
  return Math.max(1, Math.hypot(width, height)) / SKY.visibleDiameter
}

// Hysteresis keeps trackpad noise near the threshold from flickering the text.
export function compactDirectionsAtZoom(current, relativeZoom) {
  return current ? relativeZoom > 2.7 : relativeZoom >= 3
}
