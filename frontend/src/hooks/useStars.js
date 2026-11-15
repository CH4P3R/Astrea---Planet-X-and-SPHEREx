import { useCallback, useEffect, useState } from 'react'
import { observerContext } from '../services/images.js'
import { loadSky } from '../services/sky.js'
import { skySnapshotIsCurrent } from '../three/core/starDataUtils.js'

export default function useStars(observer, timeContext, timestamp) {
  const [state, setState] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((previous) => previous + 1), [])

  useEffect(() => {
    if (!observer) return
    const controller = new AbortController()
    let timer
    const refresh = async () => {
      setState((previous) => ({
        observer, timeContext, attempt, status: 'loading', error: '',
        snapshot: previous?.observer === observer && previous?.timeContext === timeContext ? previous.snapshot : null,
      }))
      try {
        const snapshot = await loadSky(observerContext(observer, timeContext), controller.signal)
        if (controller.signal.aborted) return
        if (!skySnapshotIsCurrent(snapshot, Date.now())) {
          throw new Error('La respuesta del cielo ha caducado. Vuelve a cargar las estrellas.')
        }
        setState({ observer, timeContext, attempt, snapshot, status: 'ready', error: '' })
        if (timeContext.mode === 'live') {
          timer = window.setTimeout(refresh, Math.max(1000, snapshot.sample_times_ms.at(-1) - Date.now() - 30000))
        }
      } catch (error) {
        if (!controller.signal.aborted) setState((previous) => ({ ...previous, status: 'error', error: error.message }))
      }
    }
    timer = window.setTimeout(refresh, 0)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [observer, timeContext, attempt])

  if (!observer) return { status: 'idle', snapshot: null, error: '', retry }
  const current = state?.observer === observer && state?.timeContext === timeContext && state?.attempt === attempt
  if (!current) return { status: 'loading', snapshot: null, error: '', retry }
  // The HUD clock can lag the start of a newly loaded sample window
  const expired = state.snapshot?.mode === 'live' && timestamp > state.snapshot.sample_times_ms.at(-1)
  return {
    status: expired && state.status !== 'loading' ? 'error' : state.status,
    snapshot: expired ? null : state.snapshot,
    error: state.error || (expired && state.status !== 'loading' ? 'El cielo ha caducado. Vuelve a cargar las estrellas.' : ''),
    retry,
  }
}
