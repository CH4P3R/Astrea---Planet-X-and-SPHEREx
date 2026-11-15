import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadProjection, observerContext } from '../services/images.js'
import { errorMessage } from '../i18n/messages.js'

// Each frame keeps its own WCS and expiry window. Adding C does not reload A/B.
export default function useProjectedImages(images, observer, timeContext, timestamp) {
  const [results, setResults] = useState({})
  const [attempt, setAttempt] = useState(null)
  const records = useRef({})
  const retry = useCallback((id) => setAttempt({ id }), [])
  const activeIds = new Set(images.map((image) => image.metadata.id))
  if (Object.keys(results).some((id) => !activeIds.has(id))) {
    setResults(Object.fromEntries(Object.entries(results).filter(([id]) => activeIds.has(id))))
  }

  useEffect(() => {
    if (!observer || !images.length) {
      records.current = {}
      return
    }
    const job = new AbortController()
    const timers = new Set()
    const ids = new Set(images.map((image) => image.metadata.id))
    records.current = Object.fromEntries(Object.entries(records.current).filter(([id]) => ids.has(id)))
    const pending = []
    let running = 0
    function enqueue(action) {
      pending.push(action)
      drain()
    }
    function drain() {
      while (!job.signal.aborted && running < 3 && pending.length) {
        const action = pending.shift()
        running += 1
        Promise.resolve().then(action).finally(() => { running -= 1; drain() })
      }
    }
    function schedule(action, projection) {
      if (timeContext.mode !== 'live' || job.signal.aborted) return
      const remaining = (projection?.sample_times_ms.at(-1) ?? Date.now() + 45000) - Date.now() - 30000
      const timer = window.setTimeout(() => { timers.delete(timer); enqueue(action) }, Math.max(1000, remaining))
      timers.add(timer)
    }
    for (const active of images) {
      const id = active.metadata.id
      const prior = records.current[id]
      const matched = prior?.active === active && prior.observer === observer && prior.context === timeContext
      const original = active.observer === observer && active.timeContext === timeContext ? active.projection : null
      const seed = matched ? prior.projection ?? original : original
      async function refresh() {
        if (job.signal.aborted) return
        let next
        try {
          next = await loadProjection(id, observerContext(observer, timeContext), job.signal)
          if (!job.signal.aborted) {
            const record = { active, observer, context: timeContext, projection: next, error: '' }
            records.current[id] = record
            setResults((previous) => ({ ...previous, [id]: record }))
          }
        } catch (failure) {
          if (!job.signal.aborted) {
            const latest = records.current[id]
            const projection = latest?.active === active && latest.observer === observer && latest.context === timeContext
              ? latest.projection : seed
            const record = { active, observer, context: timeContext, projection, error: errorMessage(failure) }
            records.current[id] = record
            setResults((previous) => ({ ...previous, [id]: record }))
          }
        }
        // On failure retry after a short pause; never spin on an expired seed.
        schedule(refresh, next)
      }
      const now = timeContext.mode === 'live' ? Date.now() : Date.parse(timeContext.at)
      if (!seed || seed.sample_times_ms.at(-1) < now || attempt && (attempt.id === id || attempt.id === undefined)) {
        enqueue(refresh)
      } else {
        schedule(refresh, seed)
      }
    }
    return () => { job.abort(); timers.forEach((timer) => window.clearTimeout(timer)) }
  }, [images, observer, timeContext, attempt])

  const projected = useMemo(() => Object.fromEntries(images.map((active) => {
    const result = results[active.metadata.id]
    const matches = result?.active === active && result.observer === observer && result.context === timeContext
    const original = active.observer === observer && active.timeContext === timeContext ? active.projection : null
    const projection = matches ? result.projection ?? original : original
    return [active.metadata.id, {
      image: projection ? { ...active, projection, observer, timeContext } : null,
      error: matches ? result.error : '',
    }]
  })), [images, results, observer, timeContext])
  const byId = useMemo(() => Object.fromEntries(Object.entries(projected).map(([id, result]) => {
    const projection = result.image?.projection
    return [id, { ...result, ready: Boolean(observer && projection && timestamp >= projection.sample_times_ms[0]
      && timestamp <= projection.sample_times_ms.at(-1)) }]
  })), [projected, observer, timestamp])

  return { byId, ready: images.length > 0 && images.every((image) => byId[image.metadata.id].ready), retry }
}
