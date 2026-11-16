import { Vector3 } from 'three'
import { imageFrame, projectedVertices } from '../three/core/imageFrameUtils.js'

// Use one instant and the reference camera basis for every WCS mesh
export function gifGeometry(images, requestedTimestamp, renderedFrame) {
  if (images.some((image) => !image?.projection)) throw new Error('Missing GIF projection')
  const start = Math.max(...images.map((image) => image.projection.sample_times_ms[0]))
  const end = Math.min(...images.map((image) => image.projection.sample_times_ms.at(-1)))
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw new Error('Incompatible GIF projections')
  const context = images[0].timeContext
  const now = requestedTimestamp ?? (context?.mode === 'paused' ? Date.parse(context.at) : Date.now())
  const timestamp = Math.max(start, Math.min(end, now))
  if (!Number.isFinite(timestamp)) throw new Error('Invalid GIF timestamp')
  const frame = imageFrame(images, timestamp, { left: 0, top: 0, width: 1, height: 1 }, 1, 1)
  const inverse = (renderedFrame?.orientation ?? frame.quaternion).clone().invert()
  const meshes = images.map((image) => ({
    vertices: projectedVertices(image, timestamp).map((vertex) => vertex.applyQuaternion(inverse)),
    uv: image.projection.uv,
    indices: image.projection.indices,
  }))
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const mesh of meshes) {
    if (!mesh.indices?.length || mesh.uv.length !== mesh.vertices.length * 2) throw new Error('Invalid GIF mesh')
    for (const vertex of mesh.vertices) {
      minX = Math.min(minX, vertex.x)
      maxX = Math.max(maxX, vertex.x)
      minY = Math.min(minY, vertex.y)
      maxY = Math.max(maxY, vertex.y)
    }
  }
  const extentX = maxX - minX
  const extentY = maxY - minY
  if (!(extentX > 0 && extentY > 0)) throw new Error('Empty GIF geometry')
  const nativeSize = Math.max(...images.map((image) => Math.max(image.metadata.image.width, image.metadata.image.height)))
  const nativeScale = nativeSize / Math.max(extentX, extentY)
  const scaleX = renderedFrame?.pixelsPerUnitX ?? nativeScale
  const scaleY = renderedFrame?.pixelsPerUnitY ?? nativeScale
  if (!(Number.isFinite(scaleX) && scaleX > 0 && Number.isFinite(scaleY) && scaleY > 0)) throw new Error('Invalid GIF render scale')
  const width = Math.max(1, Math.ceil(extentX * scaleX - 1e-7))
  const height = Math.max(1, Math.ceil(extentY * scaleY - 1e-7))
  if (width > 65535 || height > 65535) throw new Error('Rendered image exceeds GIF dimensions')
  for (const mesh of meshes) {
    mesh.vertices = mesh.vertices.map((vertex) => new Vector3(
      (vertex.x - minX) / extentX * width,
      (maxY - vertex.y) / extentY * height,
      0,
    ))
  }
  return { width, height, meshes }
}

export function rasterProjectedPixels(image, pixels, mesh, width, height, exposure) {
  const source = image.metadata.image
  if (!pixels?.values || pixels.values.length !== source.width * source.height) throw new Error('Invalid GIF pixels')
  const output = new Uint8Array(width * height)
  const gain = 10 * 2 ** exposure
  for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
    const ids = mesh.indices.slice(triangle, triangle + 3)
    const [a, b, c] = Array.from(ids, (index) => mesh.vertices[index])
    const area = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y)
    if (Math.abs(area) < 1e-12) continue
    const left = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)))
    const right = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x, c.x)))
    const top = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)))
    const bottom = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y, c.y)))
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const first = ((b.y - c.y) * (x + 0.5 - c.x) + (c.x - b.x) * (y + 0.5 - c.y)) / area
        const second = ((c.y - a.y) * (x + 0.5 - c.x) + (a.x - c.x) * (y + 0.5 - c.y)) / area
        const third = 1 - first - second
        if (Math.min(first, second, third) < -1e-7) continue
        const weights = [first, second, third]
        const u = weights.reduce((sum, weight, index) => sum + weight * mesh.uv[ids[index] * 2], 0)
        const v = weights.reduce((sum, weight, index) => sum + weight * mesh.uv[ids[index] * 2 + 1], 0)
        const sourceX = Math.min(source.width - 1, Math.max(0, Math.floor(u * source.width)))
        const sourceY = Math.min(source.height - 1, Math.max(0, Math.floor(v * source.height)))
        const value = pixels.values[sourceY * source.width + sourceX]
        const intensity = Number.isFinite(value) && value >= 0 ? Math.min(1, Math.asinh(value * gain) / 2.99822295) : 0
        output[y * width + x] = Math.round(intensity * 63)
      }
    }
  }
  return output
}
