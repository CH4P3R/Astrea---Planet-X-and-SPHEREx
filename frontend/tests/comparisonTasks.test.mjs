import test from 'node:test'
import assert from 'node:assert/strict'
import { mapComparisonTasks } from '../src/services/comparisonTasks.js'

test('processing a long comparison bounds concurrent requests and preserves frame order', async () => {
  let active = 0
  let maximum = 0
  const items = Array.from({ length: 12 }, (_, index) => index)
  const results = await mapComparisonTasks(items, async (index) => {
    active += 1
    maximum = Math.max(maximum, active)
    await new Promise((resolve) => setTimeout(resolve, (index % 3) + 1))
    active -= 1
    return index * 2
  }, new AbortController().signal)
  assert.equal(maximum, 3)
  assert.deepEqual(results, items.map((index) => index * 2))
})

test('cancelling a comparison prevents queued requests from starting', async () => {
  const controller = new AbortController()
  const started = []
  await assert.rejects(mapComparisonTasks([1, 2, 3, 4], async (item) => {
    started.push(item)
    controller.abort()
    return item
  }, controller.signal, 1), { name: 'AbortError' })
  assert.deepEqual(started, [1])
})
