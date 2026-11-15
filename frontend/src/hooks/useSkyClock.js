import { useEffect, useMemo, useState } from 'react'

export default function useSkyClock() {
  const [now, setNow] = useState(() => Date.now())
  const [pausedAt, setPausedAt] = useState(null)
  useEffect(() => {
    if (pausedAt !== null) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [pausedAt])
  const context = useMemo(() => pausedAt === null
    ? { mode: 'live' } : { mode: 'paused', at: new Date(pausedAt).toISOString() }, [pausedAt])
  return {
    timestamp: pausedAt ?? now,
    paused: pausedAt !== null,
    context,
    pause: () => setPausedAt(Date.now()),
    goLive: () => { setNow(Date.now()); setPausedAt(null) },
    apply: (timestamp) => setPausedAt(timestamp),
  }
}
