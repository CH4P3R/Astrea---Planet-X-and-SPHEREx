import { chronologicalFrames } from '../config/comparison.js'
import { gifGeometry, rasterProjectedPixels } from './gifGeometry.js'

export const GIF_MAX_FRAMES = 20

const smooth = (a, b, value) => {
  const x = Math.max(0, Math.min(1, (value - a) / (b - a)))
  return x * x * (3 - 2 * x)
}
const mix = (a, b, fraction) => a.map((value, index) => value + (b[index] - value) * fraction)
const srgb = (value) => Math.round(255 * (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055))

function paletteBytes(color) {
  const bytes = []
  for (let index = 0; index < 64; index += 1) {
    const intensity = index / 63
    let rgb = [intensity, intensity, intensity]
    if (color) {
      rgb = mix([0.015, 0.02, 0.08], [0.15, 0.35, 0.7], smooth(0, 0.3, intensity))
      rgb = mix(rgb, [0.45, 0.85, 0.8], smooth(0.25, 0.55, intensity))
      rgb = mix(rgb, [0.98, 0.76, 0.45], smooth(0.5, 0.8, intensity))
      rgb = mix(rgb, [1, 1, 1], smooth(0.8, 1, intensity))
    }
    bytes.push(...rgb.map(srgb))
  }
  return bytes
}

// Track code widths from the decoder's perspective to avoid boundary ambiguity
function compress(indices) {
  const bytes = []
  let bits = 7
  let decoderNext = 66
  let previous = false
  let buffer = 0
  let buffered = 0
  const emit = (code) => {
    buffer |= code << buffered
    buffered += bits
    while (buffered >= 8) {
      bytes.push(buffer & 255)
      buffer >>>= 8
      buffered -= 8
    }
    if (code === 64) {
      bits = 7
      decoderNext = 66
      previous = false
    } else if (code !== 65) {
      if (previous && decoderNext < 4096) {
        decoderNext += 1
        if (decoderNext === 2 ** bits && bits < 12) bits += 1
      }
      previous = true
    }
  }
  let dictionary = new Map()
  let next = 66
  emit(64)
  let prefix = indices[0]
  for (let index = 1; index < indices.length; index += 1) {
    const value = indices[index]
    const key = prefix * 64 + value
    const found = dictionary.get(key)
    if (found !== undefined) prefix = found
    else {
      emit(prefix)
      if (next < 4096) dictionary.set(key, next++)
      else {
        emit(64)
        dictionary = new Map()
        next = 66
      }
      prefix = value
    }
  }
  emit(prefix)
  emit(65)
  if (buffered) bytes.push(buffer & 255)
  return bytes
}

// Export loaded observations only, preserving shared normalization and playback order
export async function createComparisonGif(images, pixels, settings, interval, signal, options = {}) {
  signal?.throwIfAborted()
  const frames = chronologicalFrames(images).slice(0, GIF_MAX_FRAMES)
  if (frames.length < 2 || !Number.isFinite(interval) || interval <= 0) throw new Error('Invalid GIF sequence')
  const projected = options.projectedImages ?? images
  const selectedIds = new Set(frames.map((frame) => frame.id))
  const selected = projected.filter((image) => selectedIds.has(image?.metadata.id))
  if (selected.length !== frames.length) throw new Error('Missing GIF frames')
  const { width, height, meshes } = gifGeometry(selected, options.timestamp, options.renderedFrame)
  const bytes = []
  const word = (value) => bytes.push(value & 255, (value >> 8) & 255)
  const text = (value) => { for (const char of value) bytes.push(char.charCodeAt(0)) }
  text('GIF89a')
  word(width)
  word(height)
  bytes.push(0xd5, 0, 0, ...paletteBytes(settings.palette === 'color'))
  bytes.push(0x21, 0xff, 11)
  text('NETSCAPE2.0')
  bytes.push(3, 1, 0, 0, 0)
  const delay = Math.max(2, Math.min(65535, Math.round(interval * 100)))
  for (const frame of frames) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    signal?.throwIfAborted()
    const index = images.indexOf(frame.image)
    const meshIndex = selected.findIndex((image) => image.metadata.id === frame.id)
    const indices = rasterProjectedPixels(frame.image, pixels[index], meshes[meshIndex], width, height, settings.exposure ?? 0)
    bytes.push(0x21, 0xf9, 4, 4)
    word(delay)
    bytes.push(0, 0, 0x2c)
    word(0)
    word(0)
    word(width)
    word(height)
    bytes.push(0, 6)
    const compressed = compress(indices)
    for (let offset = 0; offset < compressed.length; offset += 255) {
      const block = compressed.slice(offset, offset + 255)
      bytes.push(block.length, ...block)
    }
    bytes.push(0)
  }
  signal?.throwIfAborted()
  bytes.push(0x3b)
  return new Blob([new Uint8Array(bytes)], { type: 'image/gif' })
}

export function downloadGif(blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'astrea-comparison.gif'
  document.body.append(link)
  try { link.click() } finally {
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
