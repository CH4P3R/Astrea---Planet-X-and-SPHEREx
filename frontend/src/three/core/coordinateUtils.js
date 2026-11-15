const RAD = Math.PI / 180

export function localSiderealDegrees(timestamp, longitude) {
  const days = timestamp / 86400000 + 2440587.5 - 2451545
  const centuries = days / 36525
  return ((280.46061837 + 360.98564736629 * days
    + 0.000387933 * centuries ** 2 - centuries ** 3 / 38710000
    + longitude) % 360 + 360) % 360
}

// Local scene: +X east, +Y zenith, -Z north. RA/Dec in degrees.
// Input is mean equator/equinox of date; excludes refraction and parallax.
export function equatorialToLocal(ra, dec, latitude, siderealDegrees, radius = 1) {
  const hourAngle = (siderealDegrees - ra) * RAD
  const lat = latitude * RAD
  const declination = dec * RAD
  const east = -Math.cos(declination) * Math.sin(hourAngle)
  const north = Math.sin(declination) * Math.cos(lat)
    - Math.cos(declination) * Math.cos(hourAngle) * Math.sin(lat)
  const up = Math.sin(declination) * Math.sin(lat)
    + Math.cos(declination) * Math.cos(hourAngle) * Math.cos(lat)
  return [east * radius, up * radius, -north * radius]
}

// Approximate J2000 → mean-of-date precession (IAU 1976).
// Suitable for an orientation grid, not precision astrometry or FITS registration.
export function precessJ2000(ra, dec, timestamp) {
  const t = (timestamp / 86400000 + 2440587.5 - 2451545) / 36525
  const zeta = (2306.2181 * t + 0.30188 * t ** 2 + 0.017998 * t ** 3) / 3600 * RAD
  const z = (2306.2181 * t + 1.09468 * t ** 2 + 0.018203 * t ** 3) / 3600 * RAD
  const theta = (2004.3109 * t - 0.42665 * t ** 2 - 0.041833 * t ** 3) / 3600 * RAD
  const a = ra * RAD + zeta
  const d = dec * RAD
  const x = Math.cos(d) * Math.sin(a)
  const y = Math.cos(theta) * Math.cos(d) * Math.cos(a) - Math.sin(theta) * Math.sin(d)
  const v = Math.sin(theta) * Math.cos(d) * Math.cos(a) + Math.cos(theta) * Math.sin(d)
  return [((Math.atan2(x, y) + z) / RAD + 360) % 360, Math.asin(Math.max(-1, Math.min(1, v))) / RAD]
}

export function gridToLocal(ra, dec, observer, timestamp, radius = 1) {
  const [currentRa, currentDec] = precessJ2000(ra, dec, timestamp)
  return equatorialToLocal(currentRa, currentDec, observer.latitude,
    localSiderealDegrees(timestamp, observer.longitude), radius)
}

// Right-handed equatorial scene basis (+X RA 18h, +Y NCP, -Z RA 0h)
// expressed in the observer's local east/up/south scene coordinates.
export function equatorialFrameBasis(observer, timestamp) {
  return [
    gridToLocal(270, 0, observer, timestamp),
    gridToLocal(0, 90, observer, timestamp),
    gridToLocal(0, 0, observer, timestamp).map((value) => -value),
  ]
}
