import test from 'node:test'
import assert from 'node:assert/strict'
import { ANY_DETECTOR, coordinateError, cutoutSizeError, DEFAULT_CUTOUT_SIZE } from '../src/config/search.js'
import { observerContext, searchCoordinates, searchImages } from '../src/services/images.js'

test('default cutout is 7 arcminutes and incomplete or invalid sizes are rejected', () => {
  assert.equal(DEFAULT_CUTOUT_SIZE, 7)
  for (const size of [0.1, DEFAULT_CUTOUT_SIZE, 30]) assert.equal(cutoutSizeError(size), '')
  for (const size of ['', NaN, Infinity, 0, -1, 30.1]) assert.notEqual(cutoutSizeError(size), '')
})

test('RA excludes 360 degrees while Dec includes both celestial poles', () => {
  for (const [ra, dec] of [[0, -90], [359.999999, 90], [83.63, -5.39]]) {
    assert.equal(coordinateError(ra, dec), '')
  }
  for (const [ra, dec] of [[360, 0], [-1, 0], [NaN, 0], [0, NaN], [0, 90.1], [0, -90.1]]) {
    assert.notEqual(coordinateError(ra, dec), '')
  }
})

test('click and manual requests share the current size, with conversion only for RA/Dec', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return { ok: true, json: async () => ({ images: [], has_more: false }) }
  })
  const signal = new AbortController().signal
  const context = observerContext({ latitude: 19.43, longitude: -99.13 }, { mode: 'paused', at: '2026-11-15T00:00:00Z' })
  const direction = [0, 1, 0]

  for (const size of [DEFAULT_CUTOUT_SIZE, 12.5]) {
    await searchImages(context, direction, size, ANY_DETECTOR, signal)
    await searchCoordinates(83.63, -5.39, size, ANY_DETECTOR, signal)
    const [click, manual] = calls.slice(-2)
    const body = JSON.parse(click.options.body)
    assert.equal(click.url, '/api/v1/images/search')
    assert.equal(click.options.method, 'POST')
    assert.equal(body.size_arcmin, size)
    assert.equal(body.limit, 1)
    assert.equal(Object.hasOwn(body, 'detector'), false)
    assert.deepEqual(body.direction, direction)
    assert.equal(body.at, context.at)
    assert.equal(body.mode, 'paused')
    assert.equal(click.options.signal, signal)

    const query = new URL(manual.url, 'https://example.test').searchParams
    assert.equal(Number(query.get('ra_deg')), 83.63)
    assert.equal(Number(query.get('dec_deg')), -5.39)
    assert.equal(Number(query.get('size_deg')), size / 60)
    assert.equal(query.get('limit'), '1')
    assert.equal(query.has('detector'), false)
    assert.equal(manual.options.body, undefined)
    assert.equal(manual.options.method, undefined)
    assert.equal(manual.options.signal, signal)
  }
})

test('detectors D1 to D6 request the latest observation of the same region through both search paths', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return { ok: true, json: async () => ({ images: [], has_more: false }) }
  })
  const signal = new AbortController().signal
  const context = observerContext({ latitude: 19.43, longitude: -99.13 }, { mode: 'paused', at: '2026-11-15T00:00:00Z' })
  const direction = [0, 1, 0]

  for (const detector of [1, 2, 3, 4, 5, 6]) {
    await searchImages(context, direction, 7, detector, signal)
    await searchCoordinates(83.63, -5.39, 7, detector, signal)
    const [click, manual] = calls.slice(-2)
    const body = JSON.parse(click.options.body)
    assert.equal(body.detector, detector)
    assert.equal(body.limit, 1)
    assert.equal(body.size_arcmin, 7)
    assert.deepEqual(body.direction, direction)
    assert.equal(click.options.signal, signal)

    const query = new URL(manual.url, 'https://example.test').searchParams
    assert.equal(query.get('detector'), String(detector))
    assert.equal(query.get('limit'), '1')
    assert.equal(Number(query.get('ra_deg')), 83.63)
    assert.equal(Number(query.get('dec_deg')), -5.39)
    assert.equal(Number(query.get('size_deg')), 7 / 60)
    assert.equal(manual.options.signal, signal)
  }
})

test('manual search propagates API errors and cancellation', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 422, json: async () => ({ detail: 'Coordenadas fuera de rango' }) }))
  await assert.rejects(searchCoordinates(0, 0, 7), /Coordenadas fuera de rango/)
  t.mock.restoreAll()
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
    signal.throwIfAborted()
  })
  const job = new AbortController()
  job.abort()
  await assert.rejects(searchCoordinates(0, 0, 7, ANY_DETECTOR, job.signal), { name: 'AbortError' })
})
