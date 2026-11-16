import { useCallback, useEffect, useRef, useState } from 'react'
import { loadSpectrum } from '../services/spectrum.js'
import { errorMessage } from '../i18n/messages.js'

// `series` holds one entry per detector the user turned on:
// { status: 'loading' | 'ready' | 'error', visible, data, error }.
const empty = { target: null, series: {} }
const sameTarget = (target, ra, dec, method) => Boolean(target) && target.ra === ra && target.dec === dec && target.method === method

export default function useSpectrum() {
  const [state, setState] = useState(empty)
  const current = useRef(empty)
  const jobs = useRef(new Map())            // detector -> AbortController of its pending measurement
  const chain = useRef(Promise.resolve())   // measurements run one after another
  const update = useCallback((change) => {
    current.current = change(current.current)
    setState(current.current)
  }, [])
  const setEntry = useCallback((detector, entry) => update((previous) => {
    const series = { ...previous.series }
    if (entry) series[detector] = entry
    else delete series[detector]
    return { ...previous, series }
  }), [update])

  const reset = useCallback(() => {
    jobs.current.forEach((job) => job.abort())
    jobs.current.clear()
    update(() => empty)
  }, [update])

  useEffect(() => () => jobs.current.forEach((job) => job.abort()), [])

  // Turning a detector on measures it the first time and shows it afterwards;
  // turning it off hides it, or stops it if it is still being measured.
  const toggle = useCallback((ra, dec, detector, method) => {
    // Another sky point or another method starts a new chart.
    if (!sameTarget(current.current.target, ra, dec, method)) {
      reset()
      update(() => ({ target: { ra, dec, method }, series: {} }))
    }
    const entry = current.current.series[detector]
    if (entry?.status === 'ready') return setEntry(detector, { ...entry, visible: !entry.visible })
    if (entry?.status === 'loading') {
      jobs.current.get(detector)?.abort()
      jobs.current.delete(detector)
      return setEntry(detector, null)
    }
    const job = new AbortController()
    jobs.current.set(detector, job)
    setEntry(detector, { status: 'loading' })
    // One detector at a time: six at once would flood the archive.
    chain.current = chain.current.then(async () => {
      if (job.signal.aborted) return
      let result
      try {
        result = { status: 'ready', visible: true, data: await loadSpectrum(ra, dec, detector, method, job.signal) }
      } catch (error) {
        result = { status: 'error', error: errorMessage(error) }
      }
      if (job.signal.aborted) return
      jobs.current.delete(detector)
      setEntry(detector, result)
    })
  }, [reset, update, setEntry])

  return { ...state, toggle, reset }
}
