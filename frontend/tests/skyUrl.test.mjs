import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildShareUrl, parseSkyUrl, serializeSkySearch, SKY_PARAMETERS, syncSkyUrl,
} from '../src/share/skyUrl.js'

const base = 'https://astrea.test/path'

test('parameter contract is exactly the four supported fields in order', () => {
  assert.deepEqual(SKY_PARAMETERS, ['ra', 'dec', 'size', 'detector'])
})

test('round trips coordinates, defaults, poles, precision, and detectors', () => {
  const cases = [
    [{ ra: 0, dec: -90, size: 0.1, detector: 0 }, 'ra=0&dec=-90&size=0.1&detector=0'],
    [{ ra: 359.999999, dec: 90, size: 30, detector: 6 }, 'ra=359.999999&dec=90&size=30&detector=6'],
    [{ ra: 83.63, dec: -5.39, size: 12.5, detector: 3 }, 'ra=83.63&dec=-5.39&size=12.5&detector=3'],
  ]
  for (const [search, query] of cases) {
    assert.equal(serializeSkySearch(search), query)
    assert.deepEqual(parseSkyUrl(`${base}/?${query}`), { status: 'valid', search })
  }
  assert.deepEqual(parseSkyUrl(`${base}/?ra=1&dec=2`), {
    status: 'valid', search: { ra: 1, dec: 2, size: 7, detector: 0 },
  })
  assert.equal(serializeSkySearch({ ra: -0, dec: 1, size: 7, detector: 0 }), 'ra=0&dec=1&size=7&detector=0')
})

test('normalizes negative zero when parsing', () => {
  const { status, search } = parseSkyUrl(`${base}/?ra=-0&dec=-0&detector=-0`)
  assert.equal(status, 'valid')
  assert.deepEqual(search, { ra: 0, dec: 0, size: 7, detector: 0 })
  assert.equal(Object.is(search.ra, 0), true)
  assert.equal(Object.is(search.dec, 0), true)
  assert.equal(Object.is(search.detector, 0), true)
})

test('rejects malformed supported parameters without interpreting unknown ones', () => {
  for (const query of [
    'ra=&dec=1', 'ra=1', 'ra=1&dec=', 'size=7', 'detector=3',
    'ra=1&ra=2&dec=3', 'ra=1&dec=2&size=7&size=8', 'ra=0x10&dec=0',
    'ra=1abc&dec=0', 'ra=Infinity&dec=0', 'ra=1e999&dec=0',
    'ra=360&dec=0', 'ra=-1&dec=0', 'ra=1&dec=90.1', 'ra=1&dec=-90.1',
    'ra=1&dec=2&size=0', 'ra=1&dec=2&size=30.1',
    'ra=1&dec=2&detector=7', 'ra=1&dec=2&detector=-1', 'ra=1&dec=2&detector=1.5',
    'ra=1&dec=2&detector=1&detector=1', 'dec=1&dec=2&ra=3',
    'ra=1&dec=2&size=', 'ra=1&dec=2&detector=', 'ra=NaN&dec=0',
  ]) assert.deepEqual(parseSkyUrl(`${base}/?${query}`), { status: 'invalid' }, query)
  assert.deepEqual(parseSkyUrl(`${base}/?fov=1&collection=x&speed=2`), { status: 'none' })
  assert.deepEqual(parseSkyUrl(`${base}/?ra=1&dec=2&fov=5`), {
    status: 'valid', search: { ra: 1, dec: 2, size: 7, detector: 0 },
  })
  assert.deepEqual(parseSkyUrl(base), { status: 'none' })
  assert.deepEqual(parseSkyUrl(`${base}/?`), { status: 'none' })
})

test('preserves plus signs only when URL-encoded, and accepts scientific notation', () => {
  assert.deepEqual(parseSkyUrl(`${base}/?ra=%2B5&dec=%2B1&size=1e-1&detector=0`), {
    status: 'valid', search: { ra: 5, dec: 1, size: 0.1, detector: 0 },
  })
  assert.deepEqual(parseSkyUrl(`${base}/?ra=1e%2B2&dec=1e%2B1`), {
    status: 'valid', search: { ra: 100, dec: 10, size: 7, detector: 0 },
  })
  assert.deepEqual(parseSkyUrl(`${base}/?ra=+5&dec=1`), { status: 'invalid' })
})

test('share links drop unrelated query and hash; synchronization preserves them', () => {
  const href = `${base}/?foo=1&ra=1&dec=2&size=7&detector=0&bar=2#frag`
  assert.equal(buildShareUrl(href, { ra: 3, dec: 4, size: 5, detector: 6 }),
    `${base}/?ra=3&dec=4&size=5&detector=6`)
  assert.equal(syncSkyUrl(href, { ra: 3, dec: 4, size: 5, detector: 6 }),
    `${base}/?foo=1&bar=2&ra=3&dec=4&size=5&detector=6#frag`)
  assert.equal(syncSkyUrl(href, null), `${base}/?foo=1&bar=2#frag`)
})

test('share links add the contract to URLs without a query or hash', () => {
  assert.equal(buildShareUrl(base, { ra: 1, dec: 2, size: 7, detector: 0 }),
    `${base}?ra=1&dec=2&size=7&detector=0`)
  assert.equal(syncSkyUrl(base, { ra: 1, dec: 2, size: 7, detector: 0 }),
    `${base}?ra=1&dec=2&size=7&detector=0`)
  assert.equal(syncSkyUrl(base, null), base)
  assert.equal(syncSkyUrl(`${base}/?ra=1&dec=2#frag`, null), `${base}/#frag`)
})

test('share links exclude synthetic URL credentials and private fields without changing synchronization', () => {
  const href = 'https://observer:synthetic-password@astrea.test:8443/sky/view?token=synthetic&ra=1#session'
  const search = { ra: 83.63, dec: -5.39, size: 12.5, detector: 3 }
  assert.equal(buildShareUrl(href, search),
    'https://astrea.test:8443/sky/view?ra=83.63&dec=-5.39&size=12.5&detector=3')
  assert.equal(syncSkyUrl(href, search),
    'https://observer:synthetic-password@astrea.test:8443/sky/view?token=synthetic&ra=83.63&dec=-5.39&size=12.5&detector=3#session')
})
