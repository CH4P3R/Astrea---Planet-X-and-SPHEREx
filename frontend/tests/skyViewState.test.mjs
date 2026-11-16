import test from 'node:test'
import assert from 'node:assert/strict'
import { Euler, OrthographicCamera, Vector3 } from 'three'
import { baseOrthographicZoom, captureSkyView, interpolateSkyView, restoreSkyView } from '../src/three/core/skyViewUtils.js'

function initialView() {
  const width = 1308
  const height = 747
  const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.02, 300)
  const rotation = new Euler(0.3, -1.2, 0.15, 'YXZ')
  const target = rotation.clone()
  camera.position.set(1, 2, 3)
  camera.quaternion.setFromEuler(rotation)
  camera.up.set(0.1, 1, 0).normalize()
  camera.zoom = baseOrthographicZoom(width, height) * 2.4
  camera.setViewOffset(width, height, 12, -7, width, height)
  camera.updateMatrixWorld(true)
  return { camera, rotation, target, width, height }
}

test('closing the preview restores the complete selection camera and navigation state', () => {
  const { camera, rotation, target, width, height } = initialView()
  const saved = captureSkyView(camera, rotation, target, width, height)
  const direction = camera.getWorldDirection(new Vector3()).toArray()
  const projection = camera.projectionMatrix.toArray()
  const world = camera.matrixWorld.toArray()
  const view = { ...camera.view }
  camera.position.set(0, 0, 0)
  camera.quaternion.identity()
  camera.up.set(0, 1, 0)
  camera.zoom = 9000
  camera.near = 0.01
  camera.far = 250
  camera.setViewOffset(width, height, -300, 140, width, height)
  rotation.set(0, 0, 0)
  target.set(0.5, 2, 0.7)

  const zoom = restoreSkyView(camera, saved, rotation, target, width, height)

  assert.equal(zoom, saved.zoomScale)
  assert.deepEqual(camera.position.toArray(), [1, 2, 3])
  assert.deepEqual(camera.getWorldDirection(new Vector3()).toArray(), direction)
  assert.deepEqual(camera.projectionMatrix.toArray(), projection)
  assert.deepEqual(camera.matrixWorld.toArray(), world)
  assert.deepEqual(camera.view, view)
  assert.deepEqual(camera.up.toArray(), saved.camera.up.toArray())
  assert.deepEqual(rotation.toArray(), saved.rotation.toArray())
  assert.deepEqual(target.toArray(), saved.targetRotation.toArray())
  assert.equal(camera.near, 0.02)
  assert.equal(camera.far, 300)
})

test('repeated image framing cannot overwrite the saved sky view', () => {
  const { camera, rotation, target, width, height } = initialView()
  const saved = captureSkyView(camera, rotation, target, width, height)
  const projection = saved.camera.projectionMatrix.toArray()
  for (const zoom of [100, 500, 4000]) {
    camera.zoom = zoom
    camera.setViewOffset(width, height, zoom / 2, -40, width, height)
    rotation.y += 1
    restoreSkyView(camera, saved, rotation, target, width, height)
    assert.deepEqual(camera.projectionMatrix.toArray(), projection)
    assert.deepEqual(saved.camera.projectionMatrix.toArray(), projection)
  }
})

test('returning after a resize preserves orientation and the original relative sky zoom', () => {
  const { camera, rotation, target, width, height } = initialView()
  const saved = captureSkyView(camera, rotation, target, width, height)
  camera.zoom = 8000
  restoreSkyView(camera, saved, rotation, target, 390, 844)
  assert.deepEqual(camera.quaternion.toArray(), saved.camera.quaternion.toArray())
  assert.equal(camera.zoom, baseOrthographicZoom(390, 844) * saved.zoomScale)
  assert.equal(camera.left, -195)
  assert.equal(camera.right, 195)
  assert.equal(camera.top, 422)
  assert.equal(camera.bottom, -422)
  assert.equal(saved.camera.left, -width / 2)
  assert.equal(saved.camera.top, height / 2)
})

test('the return animation starts from the preview and approaches the saved click view continuously', () => {
  const { camera, rotation, target, width, height } = initialView()
  const saved = captureSkyView(camera, rotation, target, width, height)
  camera.quaternion.setFromEuler(new Euler(-1.4, Math.PI - 0.01, 0.8, 'YXZ'))
  camera.zoom = 9000
  camera.setViewOffset(width, height, -240, 100, width, height)
  const from = camera.clone(false)
  const to = camera.clone(false)
  restoreSkyView(to, saved, rotation, target, width, height)
  const distance = from.quaternion.angleTo(to.quaternion)
  let remaining = distance
  let zoom = from.zoom
  for (const progress of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    interpolateSkyView(camera, from, to, progress)
    const next = camera.quaternion.angleTo(to.quaternion)
    assert.ok(next <= remaining + 1e-7)
    assert.ok(Math.abs(next - distance * (1 - progress)) < 1e-7)
    assert.ok(camera.zoom <= zoom + 1e-7)
    remaining = next
    zoom = camera.zoom
    if (progress === 0 || progress === 1) {
      const endpoint = progress === 0 ? from : to
      camera.projectionMatrix.elements.forEach((value, index) => {
        assert.ok(Math.abs(value - endpoint.projectionMatrix.elements[index]) < 1e-7)
      })
    }
  }
})

test('the return destination is the orientation and zoom at the click, not the application defaults', () => {
  const { camera, rotation, target, width, height } = initialView()
  rotation.set(-1.2, 2.8, 0.2, 'YXZ')
  target.copy(rotation)
  camera.quaternion.setFromEuler(rotation)
  camera.zoom = baseOrthographicZoom(width, height) * 5
  const saved = captureSkyView(camera, rotation, target, width, height)
  camera.quaternion.identity()
  camera.zoom = 8000
  const from = camera.clone(false)
  const destination = camera.clone(false)
  restoreSkyView(destination, saved, rotation, target, width, height)
  interpolateSkyView(camera, from, destination, 1)
  assert.ok(camera.quaternion.angleTo(saved.camera.quaternion) < 1e-7)
  assert.ok(Math.abs(camera.zoom - saved.camera.zoom) < 1e-7)
  assert.ok(Math.abs(saved.zoomScale - 5) < 1e-7)
})
