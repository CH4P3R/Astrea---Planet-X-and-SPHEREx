import test from 'node:test'
import assert from 'node:assert/strict'
import { SKY } from '../src/config/sky.js'
import { baseOrthographicZoom } from '../src/three/core/skyViewUtils.js'
import { starAppearance, starZoomScale } from '../src/three/core/starAppearanceUtils.js'

test('catalog magnitude preserves brightness and size ordering with visible faint stars', () => {
  const stars = [-1.5, 0, 3, 7].map(starAppearance)
  for (let index = 1; index < stars.length; index += 1) {
    assert.ok(stars[index].diameter < stars[index - 1].diameter)
    assert.ok(stars[index].brightness < stars[index - 1].brightness)
  }
  assert.ok(stars.at(-1).diameter >= 2)
  assert.ok(stars.at(-1).brightness > 0.45)
  assert.equal(starAppearance(-100).diameter, 9.2)
  assert.equal(starAppearance(-100).brightness, 1)
})

test('zoom enlarges symbols gently and remains bounded across the whole camera range', () => {
  const base = baseOrthographicZoom(1200, 800)
  assert.equal(starZoomScale(base, 1200, 800), 1)
  const scales = [SKY.minZoom, 1, 2, 4, 16, 64, SKY.maxZoom]
    .map((zoom) => starZoomScale(base * zoom, 1200, 800))
  for (let index = 1; index < scales.length; index += 1) {
    assert.ok(scales[index] >= scales[index - 1])
  }
  assert.ok(scales[0] >= 0.9)
  assert.ok(scales[2] > 1 && scales[2] < 1.3)
  assert.equal(scales.at(-1), 2)
  assert.equal(starZoomScale(base * 1e8, 1200, 800), 2)
})

test('resizing the viewport does not enlarge symbols at the same relative zoom', () => {
  const zoom = 8
  const scale = starZoomScale(baseOrthographicZoom(1440, 900) * zoom, 1440, 900)
  for (const [width, height] of [[360, 780], [780, 360], [2880, 1800]]) {
    assert.equal(starZoomScale(baseOrthographicZoom(width, height) * zoom, width, height), scale)
  }
})
