import test from 'node:test'
import assert from 'node:assert/strict'
import { createComparisonGif, GIF_MAX_FRAMES } from '../src/export/comparisonGif.js'
import { gifGeometry } from '../src/export/gifGeometry.js'
import { projectedVertices } from '../src/three/core/imageFrameUtils.js'
import { Quaternion } from 'three'

function observation(id, width = 2, height = 2) {
  const scale = 0.01 / Math.max(width, height)
  const directions = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
    .flatMap(([x, y]) => [x * width * scale, y * height * scale, -1])
  return { metadata: { id, image: { width, height }, observation: { start_utc: `2025-01-${String(id).padStart(2, '0')}T00:00:00Z` } },
    projection: { sample_times_ms: [1000], directions: [directions],
      uv: [0, 0, 1, 0, 0, 1, 1, 1], indices: [0, 1, 2, 1, 3, 2] } }
}

function decode(data, minimum) {
  let bit = 0
  let size = minimum + 1
  const clear = 2 ** minimum
  let dictionary
  let previous
  const output = []
  while (bit + size <= data.length * 8) {
    let code = 0
    for (let index = 0; index < size; index += 1, bit += 1) code |= ((data[bit >> 3] >> (bit % 8)) & 1) << index
    if (code === clear) {
      dictionary = Array.from({ length: clear }, (_, index) => [index])
      dictionary.push(null, null)
      previous = null
      size = minimum + 1
      continue
    }
    if (code === clear + 1) return output
    const entry = dictionary[code] ?? (code === dictionary.length && previous ? [...previous, previous[0]] : null)
    assert.ok(entry, `Invalid LZW code ${code}`)
    output.push(...entry)
    if (previous && dictionary.length < 4096) {
      dictionary.push([...previous, entry[0]])
      if (dictionary.length === 2 ** size && size < 12) size += 1
    }
    previous = entry
  }
  assert.fail('Missing GIF end code')
}

async function inspect(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const word = (offset) => bytes[offset] | (bytes[offset + 1] << 8)
  assert.equal(new TextDecoder().decode(bytes.slice(0, 6)), 'GIF89a')
  let offset = 13 + 3 * 2 ** ((bytes[10] & 7) + 1)
  const frames = []
  let delay = 0
  while (bytes[offset] !== 0x3b) {
    const marker = bytes[offset++]
    if (marker === 0x21) {
      const label = bytes[offset++]
      if (label === 0xf9) delay = word(offset + 2)
      while (bytes[offset]) offset += bytes[offset] + 1
      offset += 1
    } else {
      assert.equal(marker, 0x2c)
      const width = word(offset + 4)
      const height = word(offset + 6)
      offset += 9
      const minimum = bytes[offset++]
      const data = []
      while (bytes[offset]) {
        const length = bytes[offset++]
        data.push(...bytes.slice(offset, offset + length))
        offset += length
      }
      offset += 1
      const pixels = decode(data, minimum)
      assert.equal(pixels.length, width * height)
      frames.push({ pixels, delay })
    }
  }
  return { width: word(6), height: word(8), frames }
}

test('GIF uses chronological order, lower-left orientation and the playback interval', async () => {
  const images = [observation(2), observation(1)]
  const pixels = [{ values: new Float32Array([1, 1, 1, 1]) }, { values: new Float32Array([0, 0, 1, 1]) }]
  const blob = await createComparisonGif(images, pixels, { exposure: 0 }, 0.7)
  assert.equal(blob.type, 'image/gif')
  const result = await inspect(blob)
  assert.deepEqual(result.frames[0], { pixels: [63, 63, 0, 0], delay: 70 })
  assert.deepEqual(result.frames[1].pixels, [63, 63, 63, 63])
})

test('GIF caps export at 20 frames and uses native dimensions without a render snapshot', async () => {
  const images = Array.from({ length: 21 }, (_, index) => observation(index + 1, 640, 2))
  const pixels = images.map(() => ({ values: new Float32Array(1280) }))
  const result = await inspect(await createComparisonGif(images, pixels, {}, 1))
  assert.equal(result.frames.length, GIF_MAX_FRAMES)
  assert.equal(result.width, 640)
  assert.equal(result.height, 2)
})

test('LZW survives code-width changes and dictionary resets', async () => {
  const images = [observation(1, 320, 320), observation(2, 320, 320)]
  let seed = 12345
  const values = Float32Array.from({ length: 320 * 320 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return Math.sinh(((seed >>> 24) % 64) / 63 * 2.99822295) / 10
  })
  const result = await inspect(await createComparisonGif(images, images.map(() => ({ values })), {}, 1))
  const expected = []
  for (let y = 319; y >= 0; y -= 1) {
    for (let x = 0; x < 320; x += 1) expected.push(Math.round(Math.asinh(values[y * 320 + x] * 10) / 2.99822295 * 63))
  }
  assert.deepEqual(result.frames[0].pixels, expected)
})

test('GIF rejects incomplete sequences and supports cancellation', async () => {
  await assert.rejects(createComparisonGif([observation(1)], [], {}, 1))
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(createComparisonGif([observation(1), observation(2)], [], {}, 1, controller.signal), { name: 'AbortError' })
})

test('GIF aligns a rotated observation using its WCS instead of exporting its raw orientation', async () => {
  const images = [observation(1, 4, 4), observation(2, 4, 4)]
  images[1].projection.directions[0] = images[1].projection.directions[0]
    .map((value, index) => index % 3 === 2 ? value : -value)
  const values = Float32Array.from({ length: 16 }, (_, index) => index / 15)
  const reversed = Float32Array.from(values).reverse()
  const result = await inspect(await createComparisonGif(images, [{ values }, { values: reversed }], {}, 0.7))
  assert.deepEqual(result.frames[0].pixels, result.frames[1].pixels)
})

test('GIF aligns mirrored WCS geometry without blindly flipping every frame', async () => {
  const images = [observation(1, 4, 4), observation(2, 4, 4)]
  images[1].projection.directions[0] = images[1].projection.directions[0]
    .map((value, index) => index % 3 === 0 ? -value : value)
  const values = Float32Array.from({ length: 16 }, (_, index) => index / 15)
  const mirrored = Float32Array.from(values, (_, index) => values[Math.floor(index / 4) * 4 + 3 - index % 4])
  const result = await inspect(await createComparisonGif(images, [{ values }, { values: mirrored }], {}, 0.7))
  assert.deepEqual(result.frames[0].pixels, result.frames[1].pixels)
})

test('GIF uses refreshed projected snapshots and rejects missing geometry', async () => {
  const images = [observation(1), observation(2)]
  const pixels = images.map(() => ({ values: new Float32Array(4) }))
  images[1].projection = null
  await assert.rejects(createComparisonGif(images, pixels, {}, 1))
  const projectedImages = [images[0], observation(2)]
  const result = await inspect(await createComparisonGif(images, pixels, {}, 1, undefined, { projectedImages }))
  assert.equal(result.frames.length, 2)
})

test('GIF uses rendered element resolution above 320 pixels instead of native or fixed dimensions', async () => {
  const images = [observation(1), observation(2)]
  const vertices = projectedVertices(images[0], 1000)
  const extent = vertices[1].x - vertices[0].x
  const renderedFrame = { orientation: new Quaternion(), pixelsPerUnitX: 480 / extent, pixelsPerUnitY: 480 / extent }
  const pixels = images.map(() => ({ values: new Float32Array(4) }))
  const result = await inspect(await createComparisonGif(images, pixels, {}, 1, undefined, { renderedFrame }))
  assert.equal(result.width, 480)
  assert.equal(result.height, 480)
})

test('GIF dimensions track renderer zoom and pixel density without changing WCS alignment', () => {
  const images = [observation(1), observation(2)]
  const vertices = projectedVertices(images[0], 1000)
  const extent = vertices[1].x - vertices[0].x
  const renderedFrame = { orientation: new Quaternion(), pixelsPerUnitX: 400 / extent, pixelsPerUnitY: 400 / extent }
  const first = gifGeometry(images, 1000, renderedFrame)
  const doubled = gifGeometry(images, 1000, { ...renderedFrame,
    pixelsPerUnitX: renderedFrame.pixelsPerUnitX * 2, pixelsPerUnitY: renderedFrame.pixelsPerUnitY * 2 })
  assert.equal(first.width, 400)
  assert.equal(doubled.width, 800)
  assert.equal(doubled.height, 800)
  assert.throws(() => gifGeometry(images, 1000, { ...renderedFrame, pixelsPerUnitX: 65536 / extent }))
})
