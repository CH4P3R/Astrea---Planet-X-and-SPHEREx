import test from 'node:test'
import assert from 'node:assert/strict'
import { anchoredPanelPosition, availablePanelBounds } from '../src/components/common/panelPosition.js'

test('laptop panels fit between the clock and the language selector', () => {
  for (const [width, height] of [[1366, 768], [1280, 600], [1024, 576]]) {
    const panel = { left: 120, right: 450 }
    const clock = { left: 32, right: 240, top: 24, bottom: 86 }
    const language = { left: 32, right: 160, top: height - 68, bottom: height - 24 }
    const bounds = availablePanelBounds({ top: 0, height }, panel, [clock, language], 12)
    assert.equal(bounds.top, clock.bottom + 12)
    assert.equal(bounds.bottom, language.top - 12)
    for (const anchorTop of [110, 190, 270, 350]) {
      const panelHeight = Math.min(560, bounds.height)
      const position = anchoredPanelPosition(bounds, { top: anchorTop, height: 44 }, panelHeight, 26)
      assert.ok(position.top >= clock.bottom + 12, `${width}x${height}`)
      assert.ok(position.top + panelHeight <= language.top - 12, `${width}x${height}`)
      assert.ok(position.arrowY >= 0 && position.arrowY <= panelHeight)
    }
  }
})

test('a language selector moved to the upper right does not reserve the lower band', () => {
  const panel = { left: 98, right: 374 }
  const clock = { left: 20, right: 220, top: 24, bottom: 82 }
  const language = { left: 262, right: 374, top: 24, bottom: 68 }
  const bounds = availablePanelBounds({ top: 0, height: 844 }, panel, [clock, language], 16)
  assert.equal(bounds.top, 98)
  assert.equal(bounds.bottom, 828)
})

test('controls outside the horizontal panel bounds do not unnecessarily reduce its height', () => {
  const bounds = availablePanelBounds({ top: 0, height: 768 }, { left: 300, right: 630 }, [
    { left: 32, right: 200, top: 24, bottom: 86 },
    { left: 32, right: 144, top: 700, bottom: 744 },
  ], 12)
  assert.deepEqual(bounds, { top: 12, bottom: 756, height: 744 })
})

test('positioning respects a visual viewport offset and a shortened viewport', () => {
  const bounds = availablePanelBounds({ top: 120, height: 420 }, { left: 100, right: 430 }, [
    { left: 20, right: 230, top: 140, bottom: 202 },
    { left: 20, right: 150, top: 480, bottom: 524 },
  ], 12)
  const height = bounds.height
  const position = anchoredPanelPosition(bounds, { top: 320, height: 44 }, height, 26)
  assert.equal(position.top, 214)
  assert.equal(position.top + height, 468)
})

test('a short panel stays aligned with its trigger inside the reserved bounds', () => {
  const bounds = { top: 100, bottom: 600, height: 500 }
  for (const top of [110, 280, 550]) {
    const anchor = { top, height: 44 }
    const position = anchoredPanelPosition(bounds, anchor, 160, 26)
    assert.ok(position.top >= bounds.top)
    assert.ok(position.top + 160 <= bounds.bottom)
    assert.ok(position.arrowY >= 26 && position.arrowY <= 134)
  }
})
