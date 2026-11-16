import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Matrix4, Vector3 } from 'three'
import { GALACTIC_FRAME } from '../src/three/core/galacticFrame.js'
import { equatorialFrameBasis, gridToLocal } from '../src/three/core/coordinateUtils.js'

// Independent reference grid generated with Astropy 8.0.2:
// SkyCoord(l=l*u.deg, b=b*u.deg, frame='galactic').icrs.{ra,dec}.deg
// Includes both longitude senses, poles and off-plane points to catch mirrored
// longitude, exchanged axes and a band that only happens to cross the center.
const reference = [
  [0, 0, 266.40498828654472, -28.93617776179147],
  [90, 0, 318.00438150701746, 48.32963720684091],
  [180, 0, 86.40498828654475, 28.93617776179148],
  [270, 0, 138.00438150701751, -48.32963720684091],
  [0, 90, 192.85947789477606, 27.12825241496803],
  [35, 22, 263.90971630532914, 11.57162675649517],
  [123, -48, 12.90660749075418, 14.87172266713878],
  [315, 65, 197.93390740104257, 2.60492639608745],
  [270, -30, 89.29941433910793, -61.03284170819911],
]
const RAD = Math.PI / 180
const textureDirection = (l, b) => new Vector3(
  Math.cos(b * RAD) * Math.cos(l * RAD),
  Math.sin(b * RAD),
  -Math.cos(b * RAD) * Math.sin(l * RAD),
)

test('galactic texture coordinates match the independent Astropy ICRS grid', () => {
  for (const [l, b, ra, dec] of reference) {
    const actual = textureDirection(l, b).applyMatrix4(GALACTIC_FRAME)
    const expected = new Vector3(
      -Math.cos(dec * RAD) * Math.sin(ra * RAD),
      Math.sin(dec * RAD),
      -Math.cos(dec * RAD) * Math.cos(ra * RAD),
    )
    assert.ok(actual.distanceTo(expected) < 1e-12, `l=${l}, b=${b}`)
  }
  assert.ok(Math.abs(GALACTIC_FRAME.determinant() - 1) < 1e-12)
})

test('galactic band follows the existing observer and date orientation in both hemispheres', () => {
  for (const observer of [{ latitude: 13.7, longitude: -89.2 }, { latitude: -33.9, longitude: 151.2 }]) {
    for (const timestamp of [Date.UTC(2000, 0, 1, 12), Date.UTC(2026, 10, 15, 6), Date.UTC(2026, 10, 15, 18)]) {
      const localFrame = new Matrix4().makeBasis(
        ...equatorialFrameBasis(observer, timestamp).map((axis) => new Vector3(...axis)),
      )
      for (const [l, b, ra, dec] of reference) {
        const actual = textureDirection(l, b).applyMatrix4(GALACTIC_FRAME).applyMatrix4(localFrame)
        const expected = new Vector3(...gridToLocal(ra, dec, observer, timestamp))
        assert.ok(actual.distanceTo(expected) < 1e-10, `l=${l}, b=${b}, observer=${observer.latitude}, time=${timestamp}`)
      }
    }
  }
})
