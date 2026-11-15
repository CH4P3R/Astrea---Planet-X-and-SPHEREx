import { test } from 'node:test'
import assert from 'node:assert/strict'
import { equatorialFrameBasis, gridToLocal, localSiderealDegrees } from '../src/three/core/coordinateUtils.js'
import { baseOrthographicZoom, compactDirectionsAtZoom } from '../src/three/core/skyViewUtils.js'

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`)
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0)
const applyBasis = (axes, vector) => axes[0].map((_, i) => axes.reduce((sum, axis, j) => sum + axis[i] * vector[j], 0))

test('local equatorial frame remains an orthonormal, right-handed rotation in both hemispheres', () => {
  for (const latitude of [-90, -35, 0, 35, 90]) {
    const [x, y, z] = equatorialFrameBasis({ latitude, longitude: -99 }, Date.UTC(2026, 10, 14))
    for (const axis of [x, y, z]) near(Math.hypot(...axis), 1)
    near(dot(x, y), 0)
    near(dot(y, z), 0)
    near(dot(z, x), 0)
    near(dot([x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]], z), 1)
  }
})

test('frame rotation matches direct astronomical conversion for arbitrary RA/Dec', () => {
  const observer = { latitude: 19.4, longitude: -99.1 }
  const timestamp = Date.UTC(2026, 10, 14)
  for (const [ra, dec] of [[0, 0], [90, 45], [213, -27], [359, 80]]) {
    const a = ra * Math.PI / 180
    const d = dec * Math.PI / 180
    const local = applyBasis(equatorialFrameBasis(observer, timestamp), [-Math.cos(d) * Math.sin(a), Math.sin(d), -Math.cos(d) * Math.cos(a)])
    gridToLocal(ra, dec, observer, timestamp).forEach((value, i) => near(local[i], value))
  }
})

test('at J2000 the zenith follows observer latitude and local sidereal right ascension', () => {
  const timestamp = Date.UTC(2000, 0, 1, 12)
  const observer = { latitude: -32, longitude: 18 }
  const point = gridToLocal(localSiderealDegrees(timestamp, observer.longitude), observer.latitude, observer, timestamp)
  near(point[0], 0)
  near(point[1], 1)
  near(point[2], 0)
})

test('directions abbreviate at 3x and expand below 2.7x without threshold flicker', () => {
  assert.equal(compactDirectionsAtZoom(false, 2.99), false)
  assert.equal(compactDirectionsAtZoom(false, 3), true)
  assert.equal(compactDirectionsAtZoom(true, 2.9), true)
  assert.equal(compactDirectionsAtZoom(true, 2.7), false)
})

test('relative zoom is independent of viewport size and pixel aspect', () => {
  for (const [width, height] of [[1920, 1080], [390, 844], [800, 800]]) {
    const base = baseOrthographicZoom(width, height)
    near((base * 3) / base, 3)
    assert.ok(Math.hypot(width / (base * 0.75), height / (base * 0.75)) / 2 < 100)
  }
})
