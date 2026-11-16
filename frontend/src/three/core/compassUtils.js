// Local sky axes: +X east, +Y up, -Z north. Bearing increases clockwise.
export function compassPosition({ x, z }) {
  const horizontal = Math.hypot(x, z)
  // At the zenith/nadir there is no heading; retain the last defined position.
  if (!Number.isFinite(horizontal) || horizontal < 1e-6) return null
  return {
    x: 50 + 28 * x / horizontal,
    y: 50 + 28 * z / horizontal,
    bearing: (Math.atan2(x, -z) * 180 / Math.PI + 360) % 360,
  }
}
