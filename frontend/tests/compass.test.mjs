import test from 'node:test'
import assert from 'node:assert/strict'
import { Euler, Quaternion, Vector3 } from 'three'
import { compassPosition } from '../src/three/core/compassUtils.js'

test('compass follows the local sky cardinal axes with north at the top', () => {
  for (const [direction, x, y, bearing] of [
    [{ x: 0, z: -1 }, 50, 22, 0],
    [{ x: 1, z: 0 }, 78, 50, 90],
    [{ x: 0, z: 1 }, 50, 78, 180],
    [{ x: -1, z: 0 }, 22, 50, 270],
  ]) assert.deepEqual(compassPosition(direction), { x, y, bearing })
})

test('camera turns put the red marker in the correct quadrant independent of altitude', () => {
  for (const [yaw, bearing] of [[-Math.PI / 4, 45], [-3 * Math.PI / 4, 135],
    [3 * Math.PI / 4, 225], [Math.PI / 4, 315]]) {
    for (const pitch of [-1, 0, 1]) {
      const direction = new Vector3(0, 0, -1).applyQuaternion(new Quaternion().setFromEuler(new Euler(pitch, yaw, 0, 'YXZ')))
      const position = compassPosition(direction)
      assert.ok(Math.abs(position.bearing - bearing) < 1e-9)
      assert.ok(Math.abs(Math.hypot(position.x - 50, position.y - 50) - 28) < 1e-9)
    }
  }
})

test('looking directly up or down retains the last valid heading instead of jumping', () => {
  assert.equal(compassPosition({ x: 0, z: 0 }), null)
  assert.equal(compassPosition({ x: 1e-10, z: -1e-10 }), null)
  assert.equal(compassPosition({ x: NaN, z: 0 }), null)
})
