import { useCallback, useEffect, useRef, useState } from 'react'
import { loadSpectrum } from '../services/spectrum.js'
import { errorMessage } from '../i18n/messages.js'

// `series` holds one entry per detector asked for: { status, data, error }.
const idle = { status: 'idle', target: null, series: {}, queue: [] }
const samePoint = (target, ra, dec) => target && target.ra === ra && target.dec === dec

export default function useSpectrum() {
  const [state, setState] = useState(idle)
  const controller = useRef(null)
  const current = useRef(idle)
  const update = useCallback((change) => {
    current.current = typeof change === 'function' ? change(current.current) : change
    setState(current.current)
  }, [])

  useEffect(() => () => controller.current?.abort(), [])

  // Stops the detectors still pending; the ones already measured stay on screen.
  const cancel = useCallback(() => {
    controller.current?.abort()
    update((previous) => {
      const series = Object.fromEntries(Object.entries(previous.series).filter(([, entry]) => entry.status !== 'loading'))
      return { ...previous, series, queue: [], status: Object.keys(series).length ? 'ready' : 'idle' }
    })
  }, [update])

  // Measures the detectors one after another, so the archive is not asked for
  // six detectors' worth of exposures at once and each appears as it finishes.
  const request = useCallback(async (ra, dec, detectors) => {
    controller.current?.abort()
    const job = new AbortController()
    controller.current = job
    const kept = samePoint(current.current.target, ra, dec)
      ? Object.fromEntries(Object.entries(current.current.series).filter(([, entry]) => entry.status === 'ready')) : {}
    const queue = detectors.filter((detector) => !kept[detector])
    update({ status: queue.length ? 'loading' : 'ready', target: { ra, dec }, series: kept, queue })
    for (const detector of queue) {
      update((previous) => ({ ...previous, series: { ...previous.series, [detector]: { status: 'loading' } } }))
      let entry
      try {
        entry = { status: 'ready', data: await loadSpectrum(ra, dec, detector, job.signal) }
      } catch (error) {
        entry = { status: 'error', error: errorMessage(error) }
      }
      if (job.signal.aborted) return
      update((previous) => ({ ...previous, series: { ...previous.series, [detector]: entry } }))
    }
    if (queue.length) update((previous) => ({ ...previous, status: 'ready', queue: [] }))
  }, [update])

  return { ...state, request, cancel }
}
