import test from 'node:test'
import assert from 'node:assert/strict'
import { decodePixels, sampleWindow, validateImage } from '../src/three/core/imageDataUtils.js'

const image = {
  width: 2, height: 2, dtype: 'float32', byte_order: 'little', array_order: 'C', pixel_origin: 'lower-left',
}

test('native images above 1024 are accepted within GPU limits', () => {
  assert.doesNotThrow(() => validateImage({ ...image, width: 2048, height: 1500 }, 4096))
  assert.throws(() => validateImage({ ...image, width: 8192 }, 4096), { key: 'errors.image.gpuLimit' })
})

test('invalid dimensions and formats are rejected', () => {
  assert.throws(() => validateImage({ ...image, height: 0 }, 4096))
  assert.throws(() => validateImage({ ...image, byte_order: 'big' }, 4096))
})

test('float32 decoding preserves row order and makes nonfinite pixels transparent', () => {
  const buffer = new ArrayBuffer(16)
  const view = new DataView(buffer)
  ;[-10, 10, NaN, Infinity].forEach((value, i) => view.setFloat32(i * 4, value, true))
  const decoded = decodePixels(buffer, image)
  assert.equal(decoded.values.length, 4)
  assert.equal(decoded.values[0], 0)
  assert.equal(decoded.values[1], 1)
  assert.equal(decoded.values[2], -1)
  assert.equal(decoded.values[3], -1)
  assert.equal(view.getFloat32(0, true), -10)
})

test('float64 values are decoded little-endian without overflowing float32 before normalization', () => {
  const buffer = new ArrayBuffer(32)
  const view = new DataView(buffer)
  ;[1e100, 2e100, 3e100, 4e100].forEach((value, i) => view.setFloat64(i * 8, value, true))
  const decoded = decodePixels(buffer, { ...image, dtype: 'float64' })
  assert.equal(decoded.values[0], 0)
  assert.equal(decoded.values[1], 0.5)
  assert.equal(decoded.values[3], 1)
})

test('truncated pixel responses are rejected', () => {
  assert.throws(() => decodePixels(new ArrayBuffer(4), image), { key: 'errors.image.length' })
})

test('empty finite coverage and constant images remain well-defined', () => {
  const buffer = new ArrayBuffer(16)
  const view = new DataView(buffer)
  for (let i = 0; i < 4; i += 1) view.setFloat32(i * 4, NaN, true)
  assert.deepEqual([...decodePixels(buffer, image).values], [-1, -1, -1, -1])
  for (let i = 0; i < 4; i += 1) view.setFloat32(i * 4, 7, true)
  assert.deepEqual([...decodePixels(buffer, image).values], [0, 0, 0, 0])
})

test('projection interpolation clamps to available timestamps', () => {
  assert.deepEqual(sampleWindow([100, 200, 300], 150), [0, 1, 0.5])
  assert.deepEqual(sampleWindow([100, 200, 300], 500), [1, 2, 1])
  assert.deepEqual(sampleWindow([100], 50), [0, 0, 0])
})
