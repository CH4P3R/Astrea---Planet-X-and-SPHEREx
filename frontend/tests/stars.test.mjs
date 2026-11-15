import test from 'node:test'
import assert from 'node:assert/strict'
import { loadSky } from '../src/services/sky.js'
import { observerContext } from '../src/services/images.js'
import { interpolateStarPositions, prepareSkySnapshot, skySnapshotIsCurrent } from '../src/three/core/starDataUtils.js'

const snapshot = {
  mode: 'live',
  coordinate_frame: 'AltAz',
  catalog_version: 'test-catalog',
  star_count: 2,
  stars: [
    { hipparcos_id: 20, apparent_magnitude: 1, color_hex: '#aaccff' },
    { hipparcos_id: 10, apparent_magnitude: 7, color_hex: '#ffccaa' },
  ],
  sample_times_ms: [1000, 11000],
  directions: [[0, 0, -1, 0, -1, 0], [1, 0, 0, 0, -Math.SQRT1_2, Math.SQRT1_2]],
}

test('sky requests use the same observer and time as images and retain catalog order', async (t) => {
  const context = observerContext({ latitude: 14, longitude: -89 }, { mode: 'paused', at: '2026-11-15T00:00:00Z' })
  const signal = new AbortController().signal
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/v1/sky')
    assert.equal(options.method, 'POST')
    assert.equal(options.signal, signal)
    assert.deepEqual(JSON.parse(options.body), { ...context, magnitude_limit: 7, format: 'json' })
    return { ok: true, json: async () => ({ ...snapshot, mode: 'paused', sample_times_ms: [1000], directions: [snapshot.directions[0]] }) }
  })
  const result = await loadSky(context, signal)
  assert.deepEqual(result.stars.map((star) => star.hipparcos_id), [20, 10])
  assert.ok(result.directions[0] instanceof Float32Array)
  assert.deepEqual([...result.directions[0]], snapshot.directions[0])
})

test('interpolation stays on the sphere in the local frame, including below the horizon', () => {
  const sky = prepareSkySnapshot(snapshot)
  const positions = new Float32Array(6)
  interpolateStarPositions(sky, 1000, positions, 100)
  assert.deepEqual([...positions], [0, 0, -100, 0, -100, 0])
  interpolateStarPositions(sky, 6000, positions, 100)
  for (let offset = 0; offset < positions.length; offset += 3) {
    assert.ok(Math.abs(Math.hypot(...positions.slice(offset, offset + 3)) - 100) < 0.00001)
  }
  assert.ok(positions[0] > 0 && positions[2] < 0)
  assert.ok(positions[4] < 0 && positions[5] > 0)
})

test('paused positions stay fixed while live snapshots expire at the end of coverage', () => {
  const paused = prepareSkySnapshot({ ...snapshot, mode: 'paused', sample_times_ms: [1000], directions: [snapshot.directions[0]] })
  const positions = new Float32Array(6)
  interpolateStarPositions(paused, 900000, positions, 100)
  assert.deepEqual([...positions], [0, 0, -100, 0, -100, 0])
  assert.equal(skySnapshotIsCurrent(paused, 900000), true)
  assert.equal(skySnapshotIsCurrent(snapshot, 999), false)
  assert.equal(skySnapshotIsCurrent(snapshot, 1000), true)
  assert.equal(skySnapshotIsCurrent(snapshot, 11000), true)
  assert.equal(skySnapshotIsCurrent(snapshot, 11001), false)
})

test('inconsistent metadata, incomplete samples and invalid vectors are rejected', () => {
  for (const invalid of [
    { coordinate_frame: 'ICRS' }, { mode: 'paused' },
    { star_count: 3 }, { stars: [snapshot.stars[0]] }, { directions: [snapshot.directions[0]] },
    { sample_times_ms: [1000, 1000] }, { sample_times_ms: [11000, 1000] },
    { directions: [[0, 0, -1], snapshot.directions[1]] },
    { directions: [[0, 0, -1, 0, NaN, 0], snapshot.directions[1]] },
    { directions: [[0, 0, -1, 0, 0, 0], snapshot.directions[1]] },
  ]) assert.throws(() => prepareSkySnapshot({ ...snapshot, ...invalid }))
})

test('sky loading propagates API failures and cancellation', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 422, json: async () => ({ detail: 'Fecha fuera de cobertura IERS' }) }))
  await assert.rejects(loadSky({}), /Fecha fuera de cobertura IERS/)
  t.mock.restoreAll()
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => signal.throwIfAborted())
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(loadSky({}, controller.signal), { name: 'AbortError' })
})
