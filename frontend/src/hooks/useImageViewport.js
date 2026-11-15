import { useLayoutEffect, useState } from 'react'
import { availableImageRect } from '../three/core/imageFrameUtils.js'

export default function useImageViewport(rootRef, revision) {
  const [rect, setRect] = useState(null)
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    let frame
    const measure = () => {
      const bounds = root.getBoundingClientRect()
      const obstacles = [...root.querySelectorAll('[data-image-obstacle]')].filter((element) => !element.closest('[inert]'))
        .map((element) => element.getBoundingClientRect()).filter((box) => box.width > 0 && box.height > 0)
        .map((box) => ({ left: box.left - bounds.left, right: box.right - bounds.left,
          top: box.top - bounds.top, bottom: box.bottom - bounds.top }))
      const next = availableImageRect(bounds.width, bounds.height, obstacles)
      setRect((previous) => previous && Object.keys(next).every((key) => Math.abs(previous[key] - next[key]) < 1) ? previous : next)
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
    const resize = new ResizeObserver(schedule)
    resize.observe(root)
    root.querySelectorAll('[data-image-obstacle]').forEach((element) => resize.observe(element))
    const changes = new MutationObserver(() => {
      root.querySelectorAll('[data-image-obstacle]').forEach((element) => resize.observe(element))
      schedule()
    })
    changes.observe(root, { subtree: true, attributes: true, attributeFilter: ['data-image-obstacle', 'inert'] })
    window.visualViewport?.addEventListener('resize', schedule)
    root.addEventListener('transitionend', schedule)
    schedule()
    return () => { resize.disconnect(); changes.disconnect(); cancelAnimationFrame(frame)
      window.visualViewport?.removeEventListener('resize', schedule); root.removeEventListener('transitionend', schedule) }
  }, [rootRef, revision])
  return rect
}
