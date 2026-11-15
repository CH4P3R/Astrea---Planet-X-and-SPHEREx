import { useEffect, useRef } from 'react'

const DURATION_MS = 3000
const MAX_DISTANCE_PX = 96

export default function useScrollHint(results, enabled) {
  const scrollRef = useRef(null)
  const shownResults = useRef(null)

  useEffect(() => {
    const container = scrollRef.current
    if (!enabled || !container || !results.length || shownResults.current === results) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reducedMotion.matches) return

    let frame
    let startTime
    let origin
    let distance
    const interactionArea = container.parentElement

    function cancel() {
      window.cancelAnimationFrame(frame)
    }

    function animate(time) {
      if (startTime === undefined) {
        origin = container.scrollTop
        const remaining = container.scrollHeight - container.clientHeight - origin
        if (remaining <= 1 || container.clientHeight === 0) return
        distance = Math.min(MAX_DISTANCE_PX, container.clientHeight * 0.4, remaining)
        startTime = time
        shownResults.current = results
      }

      const progress = Math.min((time - startTime) / DURATION_MS, 1)
      // One smooth round trip, preserving the initial scroll position
      const offset = (1 - Math.cos(progress * Math.PI * 2)) / 2
      container.scrollTop = origin + distance * offset
      if (progress < 1) frame = window.requestAnimationFrame(animate)
    }

    frame = window.requestAnimationFrame(animate)
    const events = ['wheel', 'pointerdown', 'touchstart', 'keydown', 'focusin']
    events.forEach((event) => interactionArea.addEventListener(event, cancel, { passive: true }))
    reducedMotion.addEventListener('change', cancel)
    window.addEventListener('resize', cancel)

    return () => {
      cancel()
      events.forEach((event) => interactionArea.removeEventListener(event, cancel))
      reducedMotion.removeEventListener('change', cancel)
      window.removeEventListener('resize', cancel)
    }
  }, [results, enabled])

  return scrollRef
}
