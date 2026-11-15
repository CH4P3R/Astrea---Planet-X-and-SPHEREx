import { useCallback, useEffect, useRef, useState } from 'react'
import { loadMetadata, loadPixels, loadProjection, observerContext, searchImages } from '../services/images.js'
import { decodePixels, validateImage } from '../three/core/imageDataUtils.js'

export default function useFitsImage(observer) {
  const [state, setState] = useState({ status: 'idle', images: [], error: '', active: null, observer: null })
  const [size, setSize] = useState(6)
  const [armed, setArmed] = useState(false)
  const [focus, setFocus] = useState(null)
  const controller = useRef(null)
  const maxTextureSize = useRef(0)
  const reset = useCallback(() => {
    controller.current?.abort()
    setState({ status: 'idle', images: [], error: '', active: null, observer })
    setArmed(false)
    setFocus(null)
  }, [observer])

  useEffect(() => {
    return () => controller.current?.abort()
  }, [observer])

  const search = useCallback(async (direction) => {
    if (!observer) return
    controller.current?.abort()
    const job = new AbortController()
    controller.current = job
    setArmed(false)
    setState({ status: 'searching', images: [], error: '', active: null, observer })
    try {
      const result = await searchImages(observerContext(observer), direction, size, job.signal)
      if (!job.signal.aborted) setState({ status: 'results', images: result.images, hasMore: result.has_more, error: '', active: null, observer })
    } catch (error) {
      if (!job.signal.aborted) setState({ status: 'error', images: [], error: error.message, active: null, observer })
    }
  }, [observer, size])

  const load = useCallback(async (id) => {
    controller.current?.abort()
    const job = new AbortController()
    controller.current = job
    setState((previous) => ({ ...previous, status: 'loading', error: '', active: null }))
    try {
      const metadata = await loadMetadata(id, job.signal)
      validateImage(metadata.image, maxTextureSize.current)
      const [buffer, projection] = await Promise.all([
        loadPixels(id, job.signal), loadProjection(id, observerContext(observer), job.signal),
      ])
      if (job.signal.aborted) return
      const pixels = decodePixels(buffer, metadata.image)
      setState((previous) => ({ ...previous, status: 'ready', active: { metadata, pixels, projection, observer } }))
      setFocus({ direction: projection.center_directions[0], size: metadata.requested.size_deg ?? size / 60 })
    } catch (error) {
      if (!job.signal.aborted) {
        job.abort()
        setState((previous) => ({ ...previous, status: 'error', error: error.message, active: null }))
      }
    }
  }, [observer, size])

  const projectionError = useCallback((error) => {
    setState((previous) => ({ ...previous, error: `No se pudo actualizar la proyección: ${error.message}` }))
  }, [])

  const visible = state.observer === observer ? state : { status: 'idle', images: [], error: '', active: null }
  return { ...visible,
    size, setSize, armed, setArmed, search, load, reset, focus: visible.active ? focus : null, maxTextureSize, projectionError }
}
