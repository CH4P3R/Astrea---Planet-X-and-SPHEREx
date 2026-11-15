// Keep an arbitrary-length comparison from starting all its requests at once.
export async function mapComparisonTasks(items, action, signal, concurrency = 3) {
  const results = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      signal?.throwIfAborted()
      const index = cursor++
      results[index] = await action(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}
