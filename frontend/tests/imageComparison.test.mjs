import test from 'node:test'
import assert from 'node:assert/strict'
import { decodePixels, displayRange, normalizePixels } from '../src/three/core/imageDataUtils.js'
import { compatibleUnits } from '../src/config/appearance.js'
import { loadPixels, searchObservations } from '../src/services/images.js'
import { comparisonCandidate, observationTimestamp } from '../src/config/comparison.js'

test('comparison selection requires different known times and respects the detector criterion', () => {
  const a = { id: 'a', detector: 1, observation: { start_utc: '2026-11-15T12:00:00Z' } }
  const sameTime = { id: 'b', detector: 1, observation: { start_utc: '2026-11-15T13:00:00+01:00' } }
  const other = { id: 'b', detector: 2, observation: { start_utc: '2026-11-10T12:00:00' } }
  assert.equal(comparisonCandidate(a, a, false), false)
  assert.equal(comparisonCandidate(a, sameTime, false), false)
  assert.equal(comparisonCandidate(a, other, true), false)
  assert.equal(comparisonCandidate(a, other, false), true)
  assert.equal(comparisonCandidate(a, { ...other, observation: {} }, false), false)
  assert.equal(observationTimestamp('invalid'), null)
})

test('equal intensities in different observations use exactly the same display value', () => {
  const a = new Float32Array([0, 2, 4, 6, NaN])
  const b = new Float32Array([4, 20, 40, 60, Infinity])
  const range = displayRange([a, b])
  const first = normalizePixels(a, range)
  const second = normalizePixels(b, range)
  assert.equal(first.values[2], second.values[0])
  assert.equal(first.values[4], -1)
  assert.equal(second.values[4], -1)
  assert.equal(a[2], 4)
})

test('decoding retains native float64 precision for later shared scaling', () => {
  const buffer = new ArrayBuffer(16)
  const view = new DataView(buffer)
  view.setFloat64(0, 16777217, true)
  view.setFloat64(8, 16777218, true)
  const result = decodePixels(buffer, { width: 2, height: 1, dtype: 'float64' })
  assert.ok(result.raw instanceof Float64Array)
  assert.equal(result.raw[0], 16777217)
})

test('comparison rejects missing or incompatible original units', () => {
  const image = (unit) => ({ metadata: { image: { unit } } })
  assert.equal(compatibleUnits(image('MJy/sr'), image('MJy/sr')), true)
  assert.equal(compatibleUnits(image('MJy/sr'), image('Jy')), false)
  assert.equal(compatibleUnits(image(null), image(null)), false)
})

test('comparison discovery and optional processing preserve the raw image API', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return { ok: true, json: async () => ({ images: [] }), arrayBuffer: async () => new ArrayBuffer(0) }
  })
  const signal = new AbortController().signal
  await searchObservations({ ra_deg: 20, dec_deg: 10, size_deg: 0.1, detector: 3, limit: 50, frame: undefined }, signal)
  const query = new URL(calls[0].url, 'https://example.test').searchParams
  assert.equal(query.get('limit'), '50')
  assert.equal(query.get('detector'), '3')
  assert.equal(query.has('frame'), false)
  await loadPixels('image-a', signal)
  assert.equal(calls[1].url, '/api/v1/images/image-a/pixels')
  await loadPixels('image-b', signal, { mask_flags: true, subtract_zodi: true, signal_to_noise: false })
  const processed = new URL(calls[2].url, 'https://example.test').searchParams
  assert.equal(processed.get('mask_flags'), 'true')
  assert.equal(processed.get('subtract_zodi'), 'true')
  assert.equal(processed.has('signal_to_noise'), false)
  for (const call of calls) assert.equal(call.options.signal, signal)
})
