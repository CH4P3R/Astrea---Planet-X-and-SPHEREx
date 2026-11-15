import test from 'node:test'
import assert from 'node:assert/strict'
import { Euler, OrthographicCamera, Vector3 } from 'three'
import { availableImageRect, imageFrame, projectedVertices, zoomImageFrame } from '../src/three/core/imageFrameUtils.js'
import { skyDirectionAtPointer } from '../src/three/core/skyDragUtils.js'
import { SKY } from '../src/config/sky.js'

function image(angle = 0.7, aspect = 1, offset = 0) {
  const rotation = new Euler(0.4, 1.1, angle, 'YXZ')
  const directions = [[-1, -1], [1, -1], [-1, 1], [1, 1]].flatMap(([x, y]) =>
    new Vector3(x * 0.001 * aspect + offset, y * 0.001, -1).normalize().applyEuler(rotation).toArray())
  return { projection: { sample_times_ms: [1000], directions: [directions], uv: [0, 0, 1, 0, 0, 1, 1, 1] } }
}

function fitted(images, rect, width = 1308, height = 747, scale = 1) {
  const target = zoomImageFrame(imageFrame(images, 1000, rect, width, height), scale, rect, width, height)
  const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.01, 250)
  camera.quaternion.copy(target.quaternion)
  camera.zoom = target.zoom
  camera.setViewOffset(width, height, target.offsetX, target.offsetY, width, height)
  camera.updateMatrixWorld()
  const screen = images.flatMap((entry) => projectedVertices(entry, 1000)).map((vertex) => {
    vertex.project(camera)
    return { x: (vertex.x + 1) * width / 2, y: (1 - vertex.y) * height / 2 }
  })
  return { camera, screen }
}

test('image zoom preserves the focus in the free viewport instead of the canvas center', () => {
  const rect = { left: 140, top: 100, width: 420, height: 520 }
  const images = [image(0.7, 1.5)]
  const initial = fitted(images, rect)
  const zoomed = fitted(images, rect, 1308, 747, 4)
  const center = (points) => ({
    x: (Math.min(...points.map((point) => point.x)) + Math.max(...points.map((point) => point.x))) / 2,
    y: (Math.min(...points.map((point) => point.y)) + Math.max(...points.map((point) => point.y))) / 2,
  })
  const before = center(initial.screen)
  const after = center(zoomed.screen)
  assert.ok(Math.abs(after.x - before.x) < 1e-7)
  assert.ok(Math.abs(after.y - before.y) < 1e-7)
  assert.ok(Math.abs(after.x - (rect.left + rect.width / 2)) < 1e-7)
  assert.ok(Math.abs(after.y - (rect.top + rect.height / 2)) < 1e-7)
  assert.equal(zoomed.camera.zoom, initial.camera.zoom * 4)
  assert.ok(zoomed.camera.quaternion.angleTo(initial.camera.quaternion) < 1e-7)
})

test('southern framing preserves the viewing orientation instead of forcing the WCS roll', () => {
  const rotation = new Euler(-Math.PI / 2 + 0.05, Math.PI - 0.01, 0, 'YXZ')
  const camera = new OrthographicCamera()
  camera.quaternion.setFromEuler(rotation)
  const uv = [0, 0, 1, 0, 0, 1, 1, 1]
  const directions = [[-1, -1], [1, -1], [-1, 1], [1, 1]].flatMap(([x, y]) =>
    new Vector3(-x * 0.001, -y * 0.001, -1).normalize().applyEuler(rotation).toArray())
  const images = [{ projection: { sample_times_ms: [1000], directions: [directions], uv } }]
  const rect = { left: 140, top: 100, width: 420, height: 520 }
  const target = imageFrame(images, 1000, rect, 1308, 747, camera.quaternion)
  assert.ok(target.quaternion.angleTo(camera.quaternion) < 1e-7)
  assert.ok(Number.isFinite(target.zoom) && target.zoom > 0)
  assert.ok(Number.isFinite(target.offsetX) && Number.isFinite(target.offsetY))
})

test('the free viewport excludes the inspector, toolbar, clock and language control', () => {
  const obstacles = [
    { left: 640, right: 1276, top: 130, bottom: 715 },
    { left: 48, right: 136, top: 180, bottom: 550 },
    { left: 48, right: 250, top: 24, bottom: 96 },
    { left: 48, right: 128, top: 670, bottom: 715 },
  ]
  const rect = availableImageRect(1308, 747, obstacles)
  assert.ok(rect.width > 350 && rect.height > 350)
  for (const box of obstacles) {
    assert.ok(rect.left + rect.width <= box.left || rect.left >= box.right
      || rect.top + rect.height <= box.top || rect.top >= box.bottom)
  }
  const { screen } = fitted([image()], rect)
  for (const point of screen) {
    assert.ok(point.x > rect.left && point.x < rect.left + rect.width)
    assert.ok(point.y > rect.top && point.y < rect.top + rect.height)
  }
})

test('front framing removes roll while keeping a rectangular cutout complete', () => {
  const rect = { left: 160, top: 120, width: 450, height: 550 }
  const { screen } = fitted([image(1.2, 2)], rect)
  assert.ok(Math.abs(screen[0].y - screen[1].y) < 0.01)
  assert.ok(Math.abs(screen[0].x - screen[2].x) < 0.01)
  const width = Math.abs(screen[1].x - screen[0].x)
  const height = Math.abs(screen[2].y - screen[0].y)
  assert.ok(Math.abs(width / height - 2) < 0.001)
})

test('both WCS footprints fit inside the available space during comparison', () => {
  const rect = { left: 150, top: 120, width: 400, height: 500 }
  const { screen } = fitted([image(0.7), image(-0.2, 1.5, 0.001)], rect)
  for (const point of screen) {
    assert.ok(point.x > rect.left && point.x < rect.left + rect.width)
    assert.ok(point.y > rect.top && point.y < rect.top + rect.height)
  }
})

test('mobile framing leaves the image above a bottom inspector', () => {
  const rect = availableImageRect(390, 844, [
    { left: 16, right: 374, top: 400, bottom: 828 },
    { left: 16, right: 80, top: 160, bottom: 360 },
    { left: 16, right: 220, top: 24, bottom: 100 },
  ], 16)
  assert.ok(rect.top + rect.height <= 384)
  assert.ok(rect.width > 150 && rect.height > 150)
  const { screen, camera } = fitted([image()], rect, 390, 844)
  for (const point of screen) {
    const x = point.x / 390 * 2 - 1
    const y = 1 - point.y / 844 * 2
    const direction = skyDirectionAtPointer(camera, x, y).applyQuaternion(camera.quaternion)
    const projected = direction.multiplyScalar(SKY.radius).project(camera)
    assert.ok(Math.abs(projected.x - x) < 1e-8)
    assert.ok(Math.abs(projected.y - y) < 1e-8)
  }
})
