import { useLayoutEffect, useRef } from 'react'

export default function useAnchoredPanel(anchorId, visible) {
  const panelRef = useRef(null)

  useLayoutEffect(() => {
    const panel = panelRef.current
    const anchor = document.getElementById(anchorId)
    if (!visible || !panel || !anchor) return

    const viewport = window.visualViewport
    let frame = null

    function position() {
      const styles = window.getComputedStyle(panel)
      const gap = parseFloat(styles.getPropertyValue('--panel-viewport-gap'))
      const arrowInset = parseFloat(styles.getPropertyValue('--panel-arrow-inset'))
      const viewportTop = viewport?.offsetTop ?? 0
      const viewportHeight = viewport?.height ?? window.innerHeight
      const availableHeight = Math.max(0, viewportHeight - gap * 2)
      panel.style.setProperty('--panel-available-height', `${availableHeight}px`)

      const anchorBounds = anchor.getBoundingClientRect()
      const height = panel.offsetHeight
      const minTop = viewportTop + gap
      const maxTop = Math.max(minTop, viewportTop + viewportHeight - gap - height)
      const inset = Math.min(arrowInset, height / 2)
      const anchorCenter = anchorBounds.top + anchorBounds.height / 2
      const centeredTop = viewportTop + (viewportHeight - height) / 2
      const alignedTop = Math.max(anchorCenter - height + inset, Math.min(centeredTop, anchorCenter - inset))
      const top = Math.max(minTop, Math.min(alignedTop, maxTop))
      const parentTop = panel.offsetParent.getBoundingClientRect().top
      const arrowY = Math.max(inset, Math.min(anchorCenter - top, height - inset))

      panel.style.setProperty('--panel-offset-y', `${top - parentTop}px`)
      panel.style.setProperty('--panel-pointer-y', `${arrowY}px`)
    }

    function schedulePosition() {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(position)
    }

    position()
    const observer = new ResizeObserver(schedulePosition)
    observer.observe(panel)
    observer.observe(anchor)
    window.addEventListener('resize', schedulePosition)
    window.addEventListener('scroll', schedulePosition, true)
    viewport?.addEventListener('resize', schedulePosition)
    viewport?.addEventListener('scroll', schedulePosition)

    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedulePosition)
      window.removeEventListener('scroll', schedulePosition, true)
      viewport?.removeEventListener('resize', schedulePosition)
      viewport?.removeEventListener('scroll', schedulePosition)
    }
  }, [anchorId, visible])

  return panelRef
}
