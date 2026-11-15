import { useCallback, useEffect, useRef, useState } from 'react'
import { loadMetadata, loadPixels, loadProjection, observerContext, searchObservations } from '../services/images.js'
import { decodePixels, validateImage } from '../three/core/imageDataUtils.js'
import { errorMessage } from '../i18n/messages.js'
import { comparisonCandidate } from '../config/comparison.js'

const empty = { source: null, partner: null, candidates: [], hasMore: false, status: 'idle', error: '' }

export default function useImageComparison(primary, enabled, observer, timeContext, textureLimit) {
  const [state, setState] = useState(empty)
  const [sameDetector, setSameDetector] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const controller = useRef(null)
  const source = primary?.metadata.id ?? null
  if (state.source !== source) setState({ ...empty, source })
  const current = state.source === source ? state : empty
  const loadedCatalog = current.catalogKey
  const catalogKey = JSON.stringify([source, sameDetector, attempt])
  const searching = enabled && current.catalogKey !== catalogKey
  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  useEffect(() => {
    if (!primary || !enabled || loadedCatalog === catalogKey) return
    const job = new AbortController()
    const metadata = primary.metadata
    async function discover() {
      try {
        const result = await searchObservations({ ...metadata.requested, frame: undefined, limit: 50,
          detector: sameDetector ? metadata.detector : undefined }, job.signal)
        if (!job.signal.aborted) {
          setState((previous) => ({ ...empty, ...(previous.source === source ? previous : {}), source, catalogKey,
            status: 'results', error: '', hasMore: result.has_more,
            candidates: result.images.filter((image) => comparisonCandidate(metadata, image, sameDetector)) }))
        }
      } catch (failure) {
        if (!job.signal.aborted) {
          setState((previous) => ({ ...empty, ...(previous.source === source ? previous : {}), source, catalogKey,
            candidates: [], hasMore: false, status: 'error', error: errorMessage(failure) }))
        }
      }
    }
    discover()
    return () => job.abort()
  }, [primary, source, enabled, sameDetector, catalogKey, loadedCatalog])

  useEffect(() => () => controller.current?.abort(), [source, observer, timeContext, sameDetector])

  const load = useCallback(async (id) => {
    if (!primary || !observer) return
    controller.current?.abort()
    const job = new AbortController()
    controller.current = job
    setState((previous) => ({ ...previous, source, status: 'loading', error: '', pendingId: id,
      loadObserver: observer, loadTime: timeContext }))
    try {
      const metadata = await loadMetadata(id, job.signal)
      if (job.signal.aborted) return
      validateImage(metadata.image, textureLimit)
      const [buffer, projection] = await Promise.all([
        loadPixels(id, job.signal), loadProjection(id, observerContext(observer, timeContext), job.signal),
      ])
      if (!job.signal.aborted) setState((previous) => ({ ...previous, source, status: 'ready', pendingId: null,
        partner: { metadata, pixels: decodePixels(buffer, metadata.image), projection, observer, timeContext } }))
    } catch (failure) {
      if (!job.signal.aborted) {
        job.abort()
        setState((previous) => ({ ...previous, source, status: 'error', error: errorMessage(failure) }))
      }
    }
  }, [primary, observer, timeContext, source, textureLimit])

  const cancel = useCallback(() => {
    controller.current?.abort()
    setState((previous) => ({ ...previous, status: 'results', pendingId: null }))
  }, [])
  const clear = useCallback(() => {
    controller.current?.abort()
    setState((previous) => ({ ...previous, partner: null, pendingId: null, status: 'results', error: '' }))
  }, [])
  const partner = current.partner && (!sameDetector || current.partner.metadata.detector === primary?.metadata.detector)
    ? current.partner : null
  const staleLoad = current.status === 'loading' && (current.loadObserver !== observer || current.loadTime !== timeContext)
  return { ...current, status: searching ? 'searching' : staleLoad ? 'results' : current.status,
    candidates: current.catalogKey === catalogKey ? current.candidates : [],
    error: searching ? '' : current.error, partner, sameDetector, setSameDetector, load, cancel, clear, retry }
}
