export function validateImage(image, maxTextureSize) {
  const { width, height, dtype, byte_order: byteOrder, array_order: order, pixel_origin: origin } = image
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || !Number.isSafeInteger(width * height)) throw new Error('Dimensiones de imagen inválidas')
  if (width > maxTextureSize || height > maxTextureSize) {
    throw new Error(`El recorte mide ${width} × ${height} px; tu GPU admite hasta ${maxTextureSize} px por lado. Prueba una región menor.`)
  }
  if (!['float32', 'float64'].includes(dtype) || byteOrder !== 'little' || order !== 'C' || origin !== 'lower-left') {
    throw new Error('Formato de píxeles no compatible')
  }
}

export function decodePixels(buffer, image) {
  const count = image.width * image.height
  const bytes = image.dtype === 'float64' ? 8 : 4
  if (buffer.byteLength !== count * bytes) throw new Error('La longitud de los píxeles no coincide con los metadatos')
  const view = new DataView(buffer)
  const values = new Float32Array(count)
  const sample = []
  const step = Math.max(1, Math.ceil(count / 65536))
  for (let i = 0; i < count; i += 1) {
    const value = bytes === 8 ? view.getFloat64(i * bytes, true) : view.getFloat32(i * bytes, true)
    if (i % step === 0 && Number.isFinite(value)) sample.push(value)
  }
  sample.sort((a, b) => a - b)
  const low = sample[Math.floor((sample.length - 1) * 0.01)] ?? 0
  const high = sample[Math.floor((sample.length - 1) * 0.995)] ?? low
  // Normalize only the display copy, preserving native pixel dimensions
  const range = high > low ? high - low : 1
  for (let i = 0; i < count; i += 1) {
    const value = bytes === 8 ? view.getFloat64(i * bytes, true) : view.getFloat32(i * bytes, true)
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
