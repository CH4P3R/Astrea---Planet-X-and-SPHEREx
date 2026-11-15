import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Euler, OrthographicCamera, Quaternion, Vector3 } from 'three'
import { SKY } from '../src/config/sky.js'
import { baseOrthographicZoom } from '../src/three/core/skyViewUtils.js'
import { skyDirectionAtPointer, skyDragRotation } from '../src/three/core/skyDragUtils.js'

function cameraFor(width, height, zoom) {
  const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.01, 250)
  camera.zoom = baseOrthographicZoom(width, height) * zoom
  camera.updateProjectionMatrix()
  return camera
}

function assertAnchorAtPointer(camera, anchor, rotation, x, y) {
  camera.quaternion.copy(rotation)
  camera.updateMatrixWorld()
  const projected = anchor.clone().multiplyScalar(SKY.radius).project(camera)
  assert.ok(Math.abs(projected.x - x) < 1e-8)
  assert.ok(Math.abs(projected.y - y) < 1e-8)
}

test('grabbed point follows the cursor at every zoom and viewport size', () => {
  for (const [width, height] of [[1920, 1080], [390, 844], [800, 800]]) {
    for (const zoom of [SKY.minZoom, 1, 3, SKY.maxZoom]) {
      const camera = cameraFor(width, height, zoom)
      const rotation = new Quaternion().setFromEuler(new Euler(0.4, 1.2, -0.2))
      const anchor = skyDirectionAtPointer(camera, 0.2, -0.1).applyQuaternion(rotation)
      for (const [x, y] of [[0.5, -0.4], [-0.8, 0.7], [0.9, 0.9], [0.2, -0.1]]) {
        skyDragRotation(camera, x, y, anchor, rotation, rotation)
        assertAnchorAtPointer(camera, anchor, rotation, x, y)
      }
    }
  }
})

test('north stays under the cursor after small consecutive drags and reversals', () => {
  const camera = cameraFor(1920, 1080, 1)
  const anchor = new Vector3(0, 0, -1)
  const rotation = new Quaternion()
  const startRotation = rotation.clone()
  for (let step = 0; step <= 100; step++) {
    const x = Math.sin(step / 10) * 0.8
    const y = Math.cos(step / 10) * 0.5
    skyDragRotation(camera, x, y, anchor, startRotation, rotation)
    assertAnchorAtPointer(camera, anchor, rotation, x, y)
  }
  skyDragRotation(camera, 0, 0, anchor, startRotation, rotation)
  assert.ok(rotation.angleTo(startRotation) < 1e-8)
})

test('pointers outside the projected sphere do not produce an invalid rotation', () => {
  const camera = cameraFor(800, 800, 1)
  assert.equal(skyDirectionAtPointer(camera, 100, 100), null)
  const rotation = new Quaternion()
  assert.equal(skyDragRotation(camera, 100, 100, new Vector3(0, 0, -1), rotation, rotation), null)
  assert.deepEqual(rotation.toArray(), [0, 0, 0, 1])
})
