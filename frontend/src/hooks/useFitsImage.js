import { useCallback, useEffect, useRef, useState } from 'react'
import { loadMetadata, loadPixels, loadProjection, observerContext, searchImages, searchCoordinates } from '../services/images.js'
import { coordinateError, cutoutSizeError, DEFAULT_CUTOUT_SIZE } from '../config/search.js'
import { decodePixels, validateImage } from '../three/core/imageDataUtils.js'
import { errorMessage } from '../i18n/messages.js'

const emptyState = { status: 'idle', images: [], error: '', active: null, hasMore: false, query: null, notice: null }

export default function useFitsImage(observer, timeContext) {
  const [state, setState] = useState(emptyState)
  const [size, updateSize] = useState(DEFAULT_CUTOUT_SIZE)
  const [preparing, setPreparing] = useState(false)
  const [focus, setFocus] = useState(null)
  const controller = useRef(null)
  const maxTextureSize = useRef(0)
  const setTextureLimit = useCallback((value) => { maxTextureSize.current = value }, [])
  const beginPreparation = useCallback(() => setPreparing(true), [])
  const cancelPreparation = useCallback(() => setPreparing(false), [])
  const setSize = useCallback((value) => updateSize(value), [])

  const reset = useCallback(() => {
    controller.current?.abort()
    setState(emptyState)
    setPreparing(false)
    setFocus(null)
  }, [])

  useEffect(() => () => controller.current?.abort(), [])

  useEffect(() => () => {
    if (controller.current?.kind === 'load') controller.current.abort()
  }, [observer, timeContext])

  const runSearch = useCallback(async (request) => {
    controller.current?.abort()
    const job = new AbortController()
    controller.current = job
    setPreparing(false)
    setFocus(null)
    setState({ ...emptyState, status: 'searching',
      notice: { status: 'loading', message: 'search.notices.searching' } })
    try {
      const result = await request(job.signal)
      if (!job.signal.aborted) {
        const count = result.images.length
        const message = { key: result.has_more ? 'search.notices.foundMore' : 'search.notices.found', values: { count } }
        setState({ ...emptyState, status: 'results', images: result.images,
          hasMore: result.has_more, query: result.query, notice: { status: 'success', message } })
      }
    } catch (error) {
      if (!job.signal.aborted) setState({ ...emptyState, status: 'error', error: errorMessage(error) })
    }
  }, [])

  const search = useCallback((direction) => {
    const error = cutoutSizeError(size) || (!observer ? 'location.notices.required' : '')
    if (error) {
      setState((previous) => ({ ...previous, error }))
      return
    }
    return runSearch((signal) => searchImages(observerContext(observer, timeContext), direction, size, signal))
  }, [observer, size, timeContext, runSearch])

  const searchByCoordinates = useCallback((ra, dec) => {
    const error = cutoutSizeError(size) || coordinateError(ra, dec)
    if (error) {
      setState((previous) => ({ ...previous, error }))
      return
    }
    return runSearch((signal) => searchCoordinates(ra, dec, size, signal))
  }, [size, runSearch])

  const load = useCallback(async (id) => {
    if (!observer) return
    controller.current?.abort()
    const job = new AbortController()
    job.kind = 'load'
    controller.current = job
    setPreparing(false)
    setState((previous) => ({ ...previous, status: 'loading', error: '', active: null,
      notice: { status: 'loading', message: 'search.notices.loading' },
      loadObserver: observer, loadTime: timeContext }))
    try {
      const metadata = await loadMetadata(id, job.signal)
      validateImage(metadata.image, maxTextureSize.current)
      const [buffer, projection] = await Promise.all([
        loadPixels(id, job.signal), loadProjection(id, observerContext(observer, timeContext), job.signal),
      ])
      if (job.signal.aborted) return
      const pixels = decodePixels(buffer, metadata.image)
      setState((previous) => ({ ...previous, status: 'ready', active: { metadata, pixels, projection, observer, timeContext },
        notice: { status: 'success', message: 'search.notices.loaded' } }))
      setFocus({ direction: projection.center_directions[0], size: metadata.requested.size_deg ?? size / 60 })
    } catch (error) {
      if (!job.signal.aborted) {
        job.abort()
        setState((previous) => ({ ...previous, status: 'error', error: errorMessage(error), active: null, notice: null }))
      }
    }
  }, [observer, size, timeContext])

  const projectionError = useCallback((error) => {
    setState((previous) => ({ ...previous,
      error: { key: 'errors.image.projection', values: { reason: errorMessage(error) } } }))
  }, [])

  const currentContext = state.loadObserver === observer && state.loadTime === timeContext
  const visible = !currentContext && ['loading', 'ready'].includes(state.status)
    ? { ...state, status: 'results', active: null, notice: null } : state
  return { ...visible, size, setSize, preparing, beginPreparation, cancelPreparation,
    search, searchByCoordinates, load, reset, focus: visible.active ? focus : null, setTextureLimit, projectionError }
}
