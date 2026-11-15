import test from 'node:test'
import assert from 'node:assert/strict'
import { selectPosition } from '../src/components/common/selectPosition.js'

const viewport = { left: 0, top: 0, width: 1024, height: 768 }
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height })
const position = (anchor, extra = {}) => selectPosition({ anchor, width: 200, height: 100, viewport, ...extra })

test('bottom-left language trigger opens up, a trigger near the top opens down', () => {
  const bottom = position(rect(48, 688, 112, 48))
  assert.equal(bottom.side, 'top')
  assert.equal(bottom.y, 580)
  const top = position(rect(48, 24, 112, 48))
  assert.equal(top.side, 'bottom')
  assert.equal(top.y, 80)
})

test('preferred placement flips when there is not enough room', () => {
  assert.equal(position(rect(48, 24, 112, 48), { placement: 'top' }).side, 'bottom')
  assert.equal(position(rect(48, 688, 112, 48), { placement: 'bottom' }).side, 'top')
  assert.equal(position(rect(48, 300, 112, 48), { placement: 'top' }).side, 'top')
})

test('adjacent controls affect the opening side and horizontal alignment', () => {
  const blockedBelow = position(rect(48, 300, 112, 48), { obstacles: [rect(0, 360, 500, 300)] })
  assert.equal(blockedBelow.side, 'top')
  const rail = rect(48, 160, 88, 490)
  const shifted = position(rect(48, 688, 112, 48), { obstacles: [rail] })
  assert.equal(shifted.side, 'top')
  assert.ok(shifted.x >= rail.right + 8)
  assert.ok(shifted.x < 160)
})

test('narrow visual viewports constrain width and long menus get scrollable height', () => {
  const small = { left: 30, top: 100, width: 180, height: 250 }
  const result = position(rect(150, 260, 44, 44), { viewport: small, height: 288 })
  assert.equal(result.width, 156)
  assert.ok(result.x >= 42)
  assert.ok(result.x + result.width <= 198)
  assert.ok(result.y >= 112)
  assert.ok(result.maxHeight < 288)
  assert.ok(result.y + result.maxHeight <= 338)
})

test('crowded controls do not collapse the popup into an unusable strip', () => {
  const result = position(rect(48, 688, 112, 48), { obstacles: [rect(0, 12, 900, 670)] })
  assert.equal(result.side, 'top')
  assert.ok(result.maxHeight >= 100)
})
