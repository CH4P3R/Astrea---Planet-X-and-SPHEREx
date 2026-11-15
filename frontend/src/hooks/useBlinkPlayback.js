import { useCallback, useEffect, useState } from 'react'

export default function useBlinkPlayback(key, ready) {
  const [state, setState] = useState({ key: null, playing: false, frame: 'A' })
  const [interval, setIntervalValue] = useState(1)
  if (state.key !== key || (!ready && state.playing)) {
    setState({ key, playing: false, frame: state.key === key ? state.frame : 'A' })
  }
  const playing = state.key === key && ready && state.playing
  const frame = state.key === key && ready ? state.frame : 'A'
  const pause = useCallback(() => setState((previous) => ({ ...previous, playing: false })), [])
  const show = useCallback((next) => setState({ key, playing: false, frame: next }), [key])
  const toggle = useCallback(() => {
    if (ready) setState((previous) => ({ key, frame: previous.key === key ? previous.frame : 'A', playing: !playing }))
  }, [key, ready, playing])

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => setState((previous) => ({ ...previous, frame: previous.frame === 'A' ? 'B' : 'A' })), interval * 1000)
    const hide = () => { if (document.hidden) pause() }
    document.addEventListener('visibilitychange', hide)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', hide) }
  }, [playing, interval, pause])

  return { frame, playing, interval, setInterval: setIntervalValue, pause, show, toggle }
}
