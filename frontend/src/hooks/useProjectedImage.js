import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadProjection, observerContext } from '../services/images.js'
import { errorMessage } from '../i18n/messages.js'

export default function useProjectedImage(active, observer, timeContext, timestamp) {
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(null)
  if (result && result.active !== active) setResult(null)
  const imageId = active?.metadata.id
  const retry = useCallback(() => setAttempt({ id: imageId }), [imageId])
  const matches = result?.active === active && result?.observer === observer && result?.context === timeContext
  const original = active?.observer === observer && active?.timeContext === timeContext ? active.projection : null
  const projection = matches ? result.projection ?? original : original
  const error = matches ? result.error : ''
  const ready = Boolean(active && observer && projection && timestamp >= projection.sample_times_ms[0]
    && timestamp <= projection.sample_times_ms.at(-1))

  useEffect(() => {
    if (!active || !observer) return
    const job = new AbortController()
    let timer
    async function refresh() {
      try {
        const next = await loadProjection(active.metadata.id, observerContext(observer, timeContext), job.signal)
        if (!job.signal.aborted) setResult({ active, observer, context: timeContext, projection: next, error: '' })
      } catch (failure) {
        if (!job.signal.aborted) setResult((previous) => ({ active, observer, context: timeContext,
          projection: previous?.active === active && previous?.observer === observer && previous?.context === timeContext
            ? previous.projection : null, error: errorMessage(failure) }))
      }
      if (!job.signal.aborted && timeContext.mode === 'live') timer = window.setTimeout(refresh, 90000)
    }
    const seeded = active.observer === observer && active.timeContext === timeContext
      && active.projection.sample_times_ms.at(-1) >= (timeContext.mode === 'live' ? Date.now() : Date.parse(timeContext.at))
    if (!seeded || attempt?.id === active.metadata.id) refresh()
    else if (timeContext.mode === 'live') timer = window.setTimeout(refresh, 90000)
    return () => { job.abort(); window.clearTimeout(timer) }
  }, [active, observer, timeContext, attempt])

  const image = useMemo(() => active && projection ? { ...active, projection, observer, timeContext } : null,
    [active, projection, observer, timeContext])
  return { image, ready, error, retry }
}
