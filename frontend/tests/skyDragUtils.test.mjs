import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Euler, OrthographicCamera, Vector3 } from 'three'
import { SKY } from '../src/config/sky.js'
import { baseOrthographicZoom } from '../src/three/core/skyViewUtils.js'
import { dampSkyRotation, skyDirectionAtPointer, skyDragRotation, skyRotationForDirection } from '../src/three/core/skyDragUtils.js'

function cameraFor(width, height, zoom) {
  const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.01, 250)
  camera.zoom = baseOrthographicZoom(width, height) * zoom
  camera.updateProjectionMatrix()
  return camera
}

function assertLevel(rotation) {
  const right = new Vector3(1, 0, 0).applyEuler(rotation)
  const up = new Vector3(0, 1, 0).applyEuler(rotation)
  assert.ok(Math.abs(right.y) < 1e-12)
  assert.ok(up.y > 0)
}

test('horizontal and vertical drags remain independent at every zoom and viewport size', () => {
  for (const [width, height] of [[1920, 1080], [390, 844], [800, 800]]) {
    for (const zoom of [SKY.minZoom, 1, 3, SKY.maxZoom]) {
      const camera = cameraFor(width, height, zoom)
      const start = new Euler(0.4, 1.2, 0, 'YXZ')
      const horizontal = skyDragRotation(camera, 0.2, 0, start)
      assert.equal(horizontal.x, start.x)
      assert.ok(horizontal.y > start.y)
      assertLevel(horizontal)
      const vertical = skyDragRotation(camera, 0, -0.2, start)
      assert.equal(vertical.y, start.y)
      assert.ok(vertical.x > start.x)
      assertLevel(vertical)
      const reversed = skyDragRotation(camera, -0.2, 0, horizontal)
      assert.ok(Math.abs(reversed.y - start.y) < 1e-12)
    }
  }
})

test('horizontal sweeps keep the horizon level through repeated north-south turns', () => {
  const camera = cameraFor(1920, 1080, 1)
  const rotation = new Euler(0, 0, 0, 'YXZ')
  for (let step = 0; step < 1000; step += 1) {
    skyDragRotation(camera, 0.05, 0, rotation, rotation)
    assertLevel(rotation)
    assert.equal(rotation.x, 0)
  }
  assert.ok(rotation.y > Math.PI * 2)
})

test('pitch stops before either pole and reversing a drag responds immediately', () => {
  const camera = cameraFor(800, 800, 1)
  for (const sign of [-1, 1]) {
    const rotation = skyDragRotation(camera, 0, sign * 1000, new Euler(0, 0, 0, 'YXZ'))
    assert.ok(Math.abs(rotation.x) < Math.PI / 2)
    assert.ok(Math.abs(rotation.x) > Math.PI / 2 - 0.00001)
    assertLevel(rotation)
    const reversed = skyDragRotation(camera, 0, -sign * 0.1, rotation)
    assert.ok(Math.abs(reversed.x) < Math.abs(rotation.x))
    assertLevel(reversed)
  }
})

test('damped diagonal transitions do not introduce roll in intermediate frames', () => {
  const rotation = new Euler(-0.8, -1.4, 0, 'YXZ')
  const target = new Euler(0.9, 1.5, 0, 'YXZ')
  for (let frame = 0; frame < 300; frame += 1) {
    dampSkyRotation(rotation, target, 1 / 60)
    assertLevel(rotation)
  }
  assert.equal(rotation.x, target.x)
  assert.equal(rotation.y, target.y)
})

test('image focus preserves a level view and uses the shortest horizontal turn', () => {
  for (const direction of [new Vector3(0, 0, 1), new Vector3(1, 1, -1), new Vector3(-1, -2, 0.5)]) {
    const rotation = skyRotationForDirection(direction, Math.PI * 4)
    assertLevel(rotation)
    const forward = new Vector3(0, 0, -1).applyEuler(rotation)
    assert.ok(forward.distanceTo(direction.clone().normalize()) < 1e-12)
    assert.ok(Math.abs(rotation.y - Math.PI * 4) <= Math.PI)
  }
  const previousYaw = Math.PI - 0.01
  const direction = new Vector3(0, 0, -1).applyAxisAngle(new Vector3(0, 1, 0), -Math.PI + 0.01)
  const rotation = skyRotationForDirection(direction, previousYaw)
  assert.ok(Math.abs(rotation.y - previousYaw - 0.02) < 1e-12)
  for (const y of [-1, 1]) {
    const pole = skyRotationForDirection(new Vector3(0, y, 0), previousYaw)
    assert.equal(pole.y, previousYaw)
    assertLevel(pole)
  }
})

test('zoom reduces drag sensitivity without changing the active axis', () => {
  const rotation = new Euler(0, 0, 0, 'YXZ')
  const wide = skyDragRotation(cameraFor(1920, 1080, 1), 0.1, 0, rotation)
  const close = skyDragRotation(cameraFor(1920, 1080, SKY.maxZoom), 0.1, 0, rotation)
  assert.ok(close.y > 0 && close.y < wide.y / 1000)
  assert.equal(close.x, 0)
})

test('click directions still project to their screen positions after level rotations', () => {
  const camera = cameraFor(800, 800, 1)
  camera.quaternion.setFromEuler(new Euler(0.4, 1.2, 0, 'YXZ'))
  camera.updateMatrixWorld()
  for (const [x, y] of [[0, 0], [-0.8, 0.6], [0.9, -0.9]]) {
    const direction = skyDirectionAtPointer(camera, x, y).applyQuaternion(camera.quaternion)
    const projected = direction.multiplyScalar(SKY.radius).project(camera)
    assert.ok(Math.abs(projected.x - x) < 1e-12)
    assert.ok(Math.abs(projected.y - y) < 1e-12)
  }
  assert.equal(skyDirectionAtPointer(camera, 100, 100), null)
})
