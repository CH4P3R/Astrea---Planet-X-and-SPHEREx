import { LocalizedError } from '../../i18n/messages.js'

export function validateImage(image, maxTextureSize) {
  const { width, height, dtype, byte_order: byteOrder, array_order: order, pixel_origin: origin } = image
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || !Number.isSafeInteger(width * height)) throw new LocalizedError('errors.image.dimensions')
  if (width > maxTextureSize || height > maxTextureSize) {
    throw new LocalizedError('errors.image.gpuLimit', { width, height, maxTextureSize })
  }
  if (!['float32', 'float64'].includes(dtype) || byteOrder !== 'little' || order !== 'C' || origin !== 'lower-left') {
    throw new LocalizedError('errors.image.format')
  }
}

export function decodePixels(buffer, image) {
  const count = image.width * image.height
  const bytes = image.dtype === 'float64' ? 8 : 4
  if (buffer.byteLength !== count * bytes) throw new LocalizedError('errors.image.length')
  const view = new DataView(buffer)
  const raw = bytes === 8 ? new Float64Array(count) : new Float32Array(count)
  for (let i = 0; i < count; i += 1) {
    raw[i] = bytes === 8 ? view.getFloat64(i * bytes, true) : view.getFloat32(i * bytes, true)
  }
  return { raw, ...normalizePixels(raw, displayRange([raw])) }
}

export function displayRange(arrays) {
  const sample = []
  const budget = Math.max(1, Math.floor(65536 / Math.max(1, arrays.length)))
  for (const values of arrays) {
    const step = Math.max(1, Math.ceil(values.length / budget))
    for (let i = 0; i < values.length; i += step) {
      if (Number.isFinite(values[i])) sample.push(values[i])
    }
  }
  sample.sort((a, b) => a - b)
  const low = sample[Math.floor((sample.length - 1) * 0.01)] ?? 0
  const high = sample[Math.floor((sample.length - 1) * 0.995)] ?? low
  return { low, high }
}

export function normalizePixels(raw, { low, high }) {
  const count = raw.length
  const values = new Float32Array(count)
  // Normalize only the display copy, preserving native pixel dimensions
  const range = high > low ? high - low : 1
  for (let i = 0; i < count; i += 1) {
    const value = raw[i]
    values[i] = Number.isFinite(value) ? Math.max(0, Math.min(1, (value - low) / range)) : -1
  }
  return { values, low, high }
}

export function sampleWindow(times, now) {
  let first = 0
  while (first < times.length - 2 && now > times[first + 1]) first += 1
  const second = Math.min(first + 1, times.length - 1)
  const interval = times[second] - times[first]
  return [first, second, interval > 0 ? Math.max(0, Math.min(1, (now - times[first]) / interval)) : 0]
}
