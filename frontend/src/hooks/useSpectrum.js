import { useCallback, useEffect, useRef, useState } from 'react'
import { loadSpectrum } from '../services/spectrum.js'
import { errorMessage } from '../i18n/messages.js'

const closed = { status: 'idle', data: null, error: '', target: null }

export default function useSpectrum() {
  const [state, setState] = useState(closed)
  const controller = useRef(null)

  const close = useCallback(() => {
    controller.current?.abort()
    setState(closed)
  }, [])

  useEffect(() => () => controller.current?.abort(), [])

  const request = useCallback(async (ra, dec, detector) => {
    controller.current?.abort()
    const job = new AbortController()
    controller.current = job
    const target = { ra, dec, detector }
    setState({ ...closed, status: 'loading', target })
    try {
      const data = await loadSpectrum(ra, dec, detector, job.signal)
      if (!job.signal.aborted) setState({ ...closed, status: 'ready', data, target })
    } catch (error) {
      if (!job.signal.aborted) setState({ ...closed, status: 'error', error: errorMessage(error), target })
    }
  }, [])

  return { ...state, request, close }
}
