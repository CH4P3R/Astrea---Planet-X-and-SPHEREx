import { test } from 'node:test'
import assert from 'node:assert/strict'
import { equatorialToLocal, localSiderealDegrees, precessJ2000, gridToLocal } from '../src/three/core/coordinateUtils.js'

const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`)

test('equatorial observer: meridian at zenith, rising east and setting west', () => {
  const zenith = equatorialToLocal(0, 0, 0, 0)
  near(zenith[0], 0)
  near(zenith[1], 1)
  near(zenith[2], 0)
  near(equatorialToLocal(90, 0, 0, 0)[0], 1)
  near(equatorialToLocal(270, 0, 0, 0)[0], -1)
})

test('north celestial pole altitude equals observer latitude in both hemispheres', () => {
  for (const latitude of [-90, -35, 0, 35, 90]) {
    const point = equatorialToLocal(0, 90, latitude, 125)
    near(point[1], Math.sin(latitude * Math.PI / 180))
    near(point[2], -Math.cos(latitude * Math.PI / 180))
  }
})

test('sidereal time at J2000 agrees with GMST reference and east longitude advances it', () => {
  const j2000 = Date.UTC(2000, 0, 1, 12)
  near(localSiderealDegrees(j2000, 0), 280.46061837)
  near(localSiderealDegrees(j2000, 30), 310.46061837)
})

test('precession at J2000 preserves reference coordinates', () => {
  const result = precessJ2000(42, -30, Date.UTC(2000, 0, 1, 12))
  near(result[0], 42)
  near(result[1], -30)
})

test('local grid remains finite and preserves radius at poles and longitude boundaries', () => {
  for (const latitude of [-90, 0, 90]) {
    for (const longitude of [-180, 180]) {
      for (const dec of [-90, 0, 90]) {
        const point = gridToLocal(360, dec, { latitude, longitude }, Date.UTC(2026, 10, 14), 100)
        assert.ok(point.every(Number.isFinite))
        near(Math.hypot(...point), 100)
      }
    }
  }
})
