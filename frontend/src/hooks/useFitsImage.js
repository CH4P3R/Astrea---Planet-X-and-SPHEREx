import { useCallback, useEffect, useRef, useState } from 'react'
import { loadMetadata, loadPixels, loadProjection, observerContext, recropImage, searchImages, searchCoordinates } from '../services/images.js'
import { ANY_DETECTOR, coordinateError, cutoutSizeError, DEFAULT_CUTOUT_SIZE } from '../config/search.js'
import { decodePixels, validateImage } from '../three/core/imageDataUtils.js'
import { errorMessage } from '../i18n/messages.js'
import { barnardQuery } from '../config/onboarding.js'

const emptyState = { status: 'idle', images: [], error: '', active: null, hasMore: false, query: null, notice: null }

export default function useFitsImage(observer, timeContext, catalog = 'archive') {
  const [state, setState] = useState(emptyState)
  const [size, updateSize] = useState(DEFAULT_CUTOUT_SIZE)
  const [detector, updateDetector] = useState(ANY_DETECTOR)
  const [preparing, setPreparing] = useState(false)
  const [focus, setFocus] = useState(null)
  const controller = useRef(null)
  const refinement = useRef(null)
  const [detail, setDetail] = useState(null)
  const [detailError, setDetailError] = useState('')
  const [refining, setRefining] = useState(false)
  const contextRef = useRef({ observer, timeContext })
  // Repeat the last search at the same sky point when the detector changes
  const lastSearch = useRef(null)
  const maxTextureSize = useRef(0)
  const [textureLimit, updateTextureLimit] = useState(0)
  const setTextureLimit = useCallback((value) => { maxTextureSize.current = value; updateTextureLimit(value) }, [])
  const beginPreparation = useCallback(() => setPreparing(true), [])
  const cancelPreparation = useCallback(() => setPreparing(false), [])
  const setSize = useCallback((value) => updateSize(value), [])

  useEffect(() => { contextRef.current = { observer, timeContext } }, [observer, timeContext])

  const reset = useCallback(() => {
    controller.current?.abort()
    refinement.current?.abort()
    setDetail(null)
    setDetailError('')
    setRefining(false)
    lastSearch.current = null
    updateDetector(ANY_DETECTOR)
    setState(emptyState)
    setPreparing(false)
    setFocus(null)
  }, [])

  const cancel = useCallback(() => {
    if (!['searching', 'loading'].includes(state.status)) return
    controller.current?.abort()
    setState((previous) => ({ ...previous, status: previous.active ? 'ready' : 'idle', error: '',
      notice: { status: 'cancelled', message: 'search.notices.cancelled' } }))
    setPreparing(false)
  }, [state.status])

  useEffect(() => () => { controller.current?.abort(); refinement.current?.abort() }, [])

  const source = state.active
  useEffect(() => {
    return () => { refinement.current?.abort(); setRefining(false) }
  }, [source, observer, timeContext])

  const refine = useCallback(async (scale) => {
    refinement.current?.abort()
    setDetailError('')
    setRefining(false)
    if (!source || !observer || scale <= 1 || catalog === 'onboarding') { setDetail(null); return }
    const job = new AbortController()
    refinement.current = job
    setRefining(true)
    try {
      const metadata = await recropImage(source.metadata.id, source.metadata.requested.size_deg / scale, job.signal)
      if (job.signal.aborted) return
      validateImage(metadata.image, maxTextureSize.current)
      const [buffer, projection] = await Promise.all([
        loadPixels(metadata.id, job.signal), loadProjection(metadata.id, observerContext(observer, timeContext), job.signal),
      ])
      if (!job.signal.aborted) setDetail({ source, image: {
        metadata, pixels: decodePixels(buffer, metadata.image), projection, observer, timeContext,
      } })
    } catch (error) {
      if (!job.signal.aborted) setDetailError(errorMessage(error))
    } finally {
      if (!job.signal.aborted) setRefining(false)
    }
  }, [source, observer, timeContext, catalog])

  useEffect(() => () => {
    if (controller.current?.kind === 'load') controller.current.abort()
  }, [observer, timeContext])

  const load = useCallback(async (id) => {
    const { observer, timeContext } = contextRef.current
    if (!observer) return
    controller.current?.abort()
    refinement.current?.abort()
    setDetail(null)
    setDetailError('')
    setRefining(false)
    const job = new AbortController()
    job.kind = 'load'
    controller.current = job
    setPreparing(false)
    setState((previous) => ({ ...previous, status: 'loading', error: '',
      notice: { status: 'loading', message: 'search.notices.loading' },
      loadObserver: observer, loadTime: timeContext }))
    try {
      const metadata = await loadMetadata(id, job.signal)
      if (job.signal.aborted) return
      validateImage(metadata.image, maxTextureSize.current)
      const [buffer, projection] = await Promise.all([
        loadPixels(id, job.signal), loadProjection(id, observerContext(observer, timeContext), job.signal),
      ])
      if (job.signal.aborted) return
      const pixels = decodePixels(buffer, metadata.image)
      setState((previous) => ({ ...previous, status: 'ready', active: { metadata, pixels, projection, observer, timeContext },
        notice: { status: 'success', message: 'search.notices.loaded' } }))
      setFocus({ id: metadata.id })
    } catch (error) {
      if (!job.signal.aborted) {
        job.abort()
        setState((previous) => ({ ...previous, status: 'error', error: errorMessage(error),
          notice: { status: 'error', message: 'search.notices.loadFailed' } }))
      }
    }
  }, [])

  const runSearch = useCallback(async (request, keepActive = false) => {
    controller.current?.abort()
    const job = new AbortController()
    controller.current = job
    setPreparing(false)
    setState((previous) => ({ ...emptyState, active: keepActive ? previous.active : null,
      query: keepActive ? previous.query : null, status: 'searching',
      notice: { status: 'loading', message: 'search.notices.searching' } }))
    try {
      const result = await request(job.signal)
      if (!job.signal.aborted) {
        const count = result.images.length
        const message = catalog === 'onboarding' ? count === 0 ? 'onboarding.empty' : 'onboarding.found'
          : count === 0 ? 'search.notices.empty'
          : { key: result.has_more ? 'search.notices.foundMore' : 'search.notices.found', values: { count } }
        setState((previous) => ({ ...previous, status: 'results', images: result.images,
          hasMore: result.has_more, query: result.query, notice: { status: count === 0 ? 'empty' : 'success', message } }))
        const { ra_deg: ra, dec_deg: dec, size_deg: sizeDeg } = result.query
        lastSearch.current = (chosen, signal) => searchCoordinates(ra, dec, sizeDeg * 60, chosen, signal, catalog)
        // Load the most recent observation as soon as the search completes
        if (result.images[0]) await load(result.images[0].id)
      }
    } catch (error) {
      if (!job.signal.aborted) setState((previous) => ({ ...previous, status: 'error', error: errorMessage(error),
        notice: { status: 'error', message: 'search.notices.searchFailed' } }))
    }
  }, [load, catalog])

  const loadOnboarding = useCallback(() => {
    updateSize(barnardQuery.size_deg * 60)
    updateDetector(ANY_DETECTOR)
    return runSearch((signal) => searchCoordinates(barnardQuery.ra_deg, barnardQuery.dec_deg,
      barnardQuery.size_deg * 60, null, signal, 'onboarding'))
  }, [runSearch])

  const search = useCallback((direction) => {
    const error = cutoutSizeError(size) || (!observer ? 'location.notices.required' : '')
    if (error) {
      setState((previous) => ({ ...previous, error }))
      return
    }
    const context = observerContext(observer, timeContext)
    updateDetector(ANY_DETECTOR)
    lastSearch.current = (chosen, signal) => searchImages(context, direction, size, chosen, signal)
    return runSearch((signal) => lastSearch.current(ANY_DETECTOR, signal))
  }, [observer, size, timeContext, runSearch])

  const searchByCoordinates = useCallback((ra, dec) => {
    const error = cutoutSizeError(size) || coordinateError(ra, dec)
    if (error) {
      setState((previous) => ({ ...previous, error }))
      return
    }
    updateDetector(ANY_DETECTOR)
    lastSearch.current = (chosen, signal) => searchCoordinates(ra, dec, size, chosen, signal, catalog)
    return runSearch((signal) => lastSearch.current(ANY_DETECTOR, signal))
  }, [size, runSearch, catalog])

  const setDetector = useCallback((value) => {
    updateDetector(value)
    const repeat = lastSearch.current
    if (repeat) runSearch((signal) => repeat(value, signal), true)
  }, [runSearch])

  const currentContext = state.loadObserver === observer && state.loadTime === timeContext
  const visible = !currentContext && state.status === 'loading'
    ? { ...state, status: state.active ? 'ready' : 'results', notice: null } : state
  return { ...visible, size, setSize, detector, setDetector, preparing, beginPreparation, cancelPreparation,
    detail: detail?.source === visible.active ? detail.image : null, detailError, refining, refine,
    search, searchByCoordinates, loadOnboarding, load, cancel, reset, focus: visible.active ? focus : null,
    setTextureLimit, textureLimit }
}
