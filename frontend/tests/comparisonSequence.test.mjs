import test from 'node:test'
import assert from 'node:assert/strict'
import { MISSION_START_YEAR, chronologicalFrames, comparisonQuery, comparisonYears, frameLabel, nextFrameId, observationDay } from '../src/config/comparison.js'
import { searchObservations } from '../src/services/images.js'

const image = (id, start) => ({ metadata: { id, observation: { start_utc: start } } })
const currentYear = new Date().getUTCFullYear()

test('comparison years start with the SPHEREx mission and never offer historical calendar years', () => {
  assert.equal(MISSION_START_YEAR, 2025)
  assert.deepEqual(comparisonYears(2025), [2025])
  assert.deepEqual(comparisonYears(2027), [2027, 2026, 2025])
  assert.deepEqual(comparisonYears(), Array.from({ length: currentYear - 2025 + 1 }, (_, index) => currentYear - index))
  assert.equal(observationDay('2026-11-15T23:30:00-02:00'), '2026-11-16')
  assert.equal(observationDay('2026-11-15T00:00:00'), '2026-11-15')
  assert.equal(observationDay('invalid'), null)
})

test('comparison query keeps A region and detector and directly requests the entire UTC year', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return { ok: true, json: async () => ({ images: [], has_more: true }) }
  })
  const metadata = { detector: 4, requested: { ra_deg: 210.8, dec_deg: 54.3, size_deg: 0.1, frame: 'icrs' } }
  const signal = new AbortController().signal
  const result = await searchObservations(comparisonQuery(metadata, currentYear), signal)
  const url = new URL(calls[0].url, 'https://example.test')
  const query = url.searchParams
  assert.equal(url.pathname, '/api/v1/images')
  assert.equal(query.get('ra_deg'), '210.8')
  assert.equal(query.get('dec_deg'), '54.3')
  assert.equal(query.get('size_deg'), '0.1')
  assert.equal(query.get('detector'), '4')
  assert.equal(query.get('limit'), '100')
  assert.equal(query.get('start_time'), `${currentYear}-01-01T00:00:00Z`)
  assert.equal(query.get('end_time'), `${currentYear}-12-31T23:59:59.999999Z`)
  assert.equal(query.has('frame'), false)
  assert.equal(calls[0].options.signal, signal)
  assert.equal(result.has_more, true)
  await searchObservations(comparisonQuery(metadata, 2025, false), signal)
  assert.equal(new URL(calls[1].url, 'https://example.test').searchParams.has('detector'), false)
  for (const year of [1900, 2024, currentYear + 1, currentYear + 0.5, String(currentYear), NaN, null]) {
    assert.equal(comparisonQuery(metadata, year), null, String(year))
  }
})

test('annual search failure remains distinguishable from an empty result', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 502,
    json: async () => ({ detail: 'IRSA search is temporarily unavailable.' }) }))
  await assert.rejects(searchObservations({ ra_deg: 210, dec_deg: 54, start_time: `${currentYear}-01-01T00:00:00Z` }))
})

test('timeline is chronological while labels and A reference follow selection order', () => {
  const images = [image('a', '2026-11-15T00:00:00Z'), image('b', '2026-11-01T00:00:00Z'), image('c', '2026-11-05T00:00:00Z')]
  const frames = chronologicalFrames(images)
  assert.deepEqual(frames.map(({ id, label, reference }) => ({ id, label, reference })), [
    { id: 'b', label: 'B', reference: false },
    { id: 'c', label: 'C', reference: false },
    { id: 'a', label: 'A', reference: true },
  ])
  assert.equal(frames[2].image, images[0])
  assert.deepEqual(images.map(({ metadata }) => metadata.id), ['a', 'b', 'c'])
  assert.deepEqual(chronologicalFrames([images[0], images[2]]).map(({ id }) => id), ['c', 'a'])
})

test('timeline labels extend beyond Z without a sequence length cap', () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51, 52, 701, 702].map(frameLabel), ['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA'])
  assert.throws(() => frameLabel(-1), RangeError)
  assert.throws(() => frameLabel(0.5), RangeError)
})

test('timeline loops forward/backward over three or more frames and preserves IDs after removal', () => {
  const frames = chronologicalFrames([
    image('a', '2026-11-15T00:00:00Z'), image('b', '2026-11-01T00:00:00Z'),
    image('c', '2026-11-05T00:00:00Z'), image('d', '2026-11-08T00:00:00Z'),
  ])
  let id = 'a'
  const visited = []
  for (let index = 0; index < 5; index += 1) {
    id = nextFrameId(frames, id)
    visited.push(id)
  }
  assert.deepEqual(visited, ['b', 'c', 'd', 'a', 'b'])
  assert.equal(nextFrameId(frames, 'b', -1), 'a')
  assert.equal(nextFrameId(frames.filter(({ id: entry }) => entry !== 'c'), 'b'), 'd')
  assert.equal(nextFrameId(frames, 'removed'), 'b')
  assert.equal(nextFrameId([], 'a'), null)
  assert.equal(nextFrameId(frames.filter(({ reference }) => reference), 'a'), 'a')
})

test('unknown dates sort last and equal capture times keep their selection order', () => {
  const frames = chronologicalFrames([image('a', null), image('b', '2026-11-05T00:00:00Z'), image('c', '2026-11-05T00:00:00Z')])
  assert.deepEqual(frames.map(({ id }) => id), ['b', 'c', 'a'])
})
