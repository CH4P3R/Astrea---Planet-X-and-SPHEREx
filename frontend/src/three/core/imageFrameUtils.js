import { Matrix4, Quaternion, Vector3 } from 'three'
import { SKY } from '../../config/sky.js'
import { sampleWindow } from './imageDataUtils.js'

export function availableImageRect(width, height, obstacles, margin = 24) {
  const edge = Math.min(margin, width / 8, height / 8)
  const bounds = { left: edge, right: width - edge, top: edge, bottom: height - edge }
  const boxes = obstacles.map((box) => ({ left: Math.max(bounds.left, box.left - edge),
    right: Math.min(bounds.right, box.right + edge), top: Math.max(bounds.top, box.top - edge),
    bottom: Math.min(bounds.bottom, box.bottom + edge) })).filter((box) => box.right > box.left && box.bottom > box.top)
  const xs = [...new Set([bounds.left, bounds.right, ...boxes.flatMap((box) => [box.left, box.right])])].sort((a, b) => a - b)
  let best = { left: 0, top: 0, width: 0, height: 0 }
  let score = -1
  const consider = (left, right, top, bottom) => {
    const w = right - left
    const h = bottom - top
    const next = Math.min(w, h) ** 2 + w * h * 0.01
    if (w > 0 && h > 0 && next > score) { best = { left, top, width: w, height: h }; score = next }
  }
  for (let a = 0; a < xs.length - 1; a += 1) {
    for (let b = a + 1; b < xs.length; b += 1) {
      const occupied = boxes.filter((box) => box.left < xs[b] && box.right > xs[a]).sort((x, y) => x.top - y.top)
      let top = bounds.top
      for (const box of occupied) { consider(xs[a], xs[b], top, box.top); top = Math.max(top, box.bottom) }
      consider(xs[a], xs[b], top, bounds.bottom)
    }
  }
  return best
}

export function projectedVertices(image, timestamp) {
  const projection = image.projection
  const [a, b, blend] = sampleWindow(projection.sample_times_ms, timestamp)
  const first = projection.directions[a]
  const second = projection.directions[b]
  const vertices = []
  for (let i = 0; i < first.length; i += 3) {
    vertices.push(new Vector3(
      first[i] + (second[i] - first[i]) * blend,
      first[i + 1] + (second[i + 1] - first[i + 1]) * blend,
      first[i + 2] + (second[i + 2] - first[i + 2]) * blend,
    ).normalize().multiplyScalar(SKY.radius))
  }
  return vertices
}

export function zoomImageFrame(frame, scale, rect, width, height) {
  const centerX = width / 2 - (rect.left + rect.width / 2)
  const centerY = height / 2 - (rect.top + rect.height / 2)
  return { ...frame, zoom: frame.zoom * scale,
    offsetX: centerX + (frame.offsetX - centerX) * scale,
    offsetY: centerY + (frame.offsetY - centerY) * scale }
}

export function imageFrame(images, timestamp, rect, width, height, orientation = null) {
  if (!images.length || rect.width <= 0 || rect.height <= 0) return null
  const vertices = projectedVertices(images[0], timestamp)
  const uv = images[0].projection.uv
  const bottom = new Vector3()
  const top = new Vector3()
  const center = new Vector3()
  let topCount = 0
  let bottomCount = 0
  vertices.forEach((vertex, index) => {
    center.add(vertex)
    if (uv[index * 2 + 1] < 0.001) { bottom.add(vertex); bottomCount += 1 }
    if (uv[index * 2 + 1] > 0.999) { top.add(vertex); topCount += 1 }
  })
  center.normalize()
  const z = center.clone().negate()
  const up = top.multiplyScalar(1 / Math.max(1, topCount)).sub(bottom.multiplyScalar(1 / Math.max(1, bottomCount)))
  up.addScaledVector(z, -up.dot(z)).normalize()
  if (up.lengthSq() < 0.5) {
    up.set(Math.abs(z.y) > 0.9 ? 1 : 0, Math.abs(z.y) > 0.9 ? 0 : 1, 0)
    up.addScaledVector(z, -up.dot(z)).normalize()
  }
  const right = new Vector3().crossVectors(up, z).normalize()
  up.crossVectors(z, right).normalize()
  let quaternion = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, z))
  if (orientation) {
    const forward = new Vector3(0, 0, -1).applyQuaternion(orientation)
    quaternion = new Quaternion().setFromUnitVectors(forward, center).multiply(orientation).normalize()
    right.set(1, 0, 0).applyQuaternion(quaternion)
    up.set(0, 1, 0).applyQuaternion(quaternion)
  }
  const all = [...vertices, ...images.slice(1).flatMap((image) => projectedVertices(image, timestamp))]
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const vertex of all) {
    const x = vertex.dot(right)
    const y = vertex.dot(up)
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
  const zoom = Math.min(rect.width / Math.max(1e-10, maxX - minX), rect.height / Math.max(1e-10, maxY - minY)) * 0.88
  return { quaternion, zoom,
    offsetX: width / 2 - (rect.left + rect.width / 2) + (minX + maxX) / 2 * zoom,
    offsetY: height / 2 - (rect.top + rect.height / 2) - (minY + maxY) / 2 * zoom }
}
