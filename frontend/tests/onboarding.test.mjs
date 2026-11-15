import test from 'node:test'
import assert from 'node:assert/strict'
import { saveTourStatus, shouldStartTour, tourOptions, tourPosition, tourSteps, tourStorageKey } from '../src/components/onboarding/tourState.js'

test('first visit starts the tour and completed or skipped visits do not', () => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  assert.equal(shouldStartTour(storage), true)
  for (const status of ['completed', 'skipped']) {
    assert.equal(saveTourStatus(storage, status), true)
    assert.equal(values.get(tourStorageKey), status)
    assert.equal(shouldStartTour(storage), false)
  }
  values.set(tourStorageKey, 'invalid')
  assert.equal(shouldStartTour(storage), true)
  assert.equal(saveTourStatus(storage, 'invalid'), false)
})

test('blocked or missing storage never prevents the tour from working', () => {
  const blocked = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
  assert.equal(shouldStartTour(blocked), true)
  assert.equal(saveTourStatus(blocked, 'skipped'), false)
  assert.equal(shouldStartTour(undefined), true)
  assert.equal(saveTourStatus(undefined, 'completed'), false)
})

test('tour has no scene anchors and explicitly disables automatic scrolling', () => {
  assert.equal(tourOptions.scrollTo, false)
  assert.deepEqual(tourSteps.map(({ id }) => id), ['welcome', 'time', 'location', 'search', 'sky', 'data', 'appearance', 'compare'])
  assert.ok(tourSteps.every(({ target }) => target === '.context-rail' || target.startsWith('[data-tour-panel=') || target === '.image-inspector'))
  assert.deepEqual(tourSteps.filter(({ tab }) => tab).map(({ tab }) => tab), ['data', 'appearance', 'compare'])
})

test('tour card fits desktop, narrow and short viewports including missing anchors', () => {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }, { width: 568, height: 320 }]) {
    const card = { width: Math.min(360, viewport.width - 24), height: Math.min(280, viewport.height - 24) }
    for (const target of [null, { left: 20, top: 120, right: 100, bottom: 400 },
      { left: viewport.width - 310, top: 24, right: viewport.width - 24, bottom: 380 }]) {
      const position = tourPosition(target, card, viewport)
      assert.ok(position.left >= 12)
      assert.ok(position.top >= 12)
      assert.ok(position.left + card.width <= viewport.width - 12)
      assert.ok(position.top + card.height <= viewport.height - 12)
    }
  }
})

test('card chooses free space beside an anchor when it fits', () => {
  assert.deepEqual(tourPosition({ left: 24, top: 100, right: 120, bottom: 400 },
    { width: 360, height: 280 }, { width: 1366, height: 768 }), { left: 136, top: 100 })
})
