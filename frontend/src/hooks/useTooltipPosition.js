import { useLayoutEffect } from 'react'

export default function useTooltipPosition(anchorRef, tooltipRef, visible, placement, message, point) {
  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const tooltip = tooltipRef.current
    if (!visible || (!anchor && !point) || !tooltip) return
    const viewport = window.visualViewport
    let frame = null

    function position() {
      const bounds = point ? { left: point.x, top: point.y, bottom: point.y, width: 0, height: 0 }
        : anchor.getBoundingClientRect()
      const width = tooltip.offsetWidth
      const height = tooltip.offsetHeight
      const viewportTop = viewport?.offsetTop ?? 0
      const viewportLeft = viewport?.offsetLeft ?? 0
      const minY = viewportTop + 8
      const maxY = viewportTop + (viewport?.height ?? window.innerHeight) - 8
      const minX = viewportLeft + 12
      const maxX = viewportLeft + (viewport?.width ?? window.innerWidth) - width - 12
      const above = bounds.top - minY - 10
      const below = maxY - bounds.bottom - 10
      let side = placement
      if (side === 'top' && above < height && below > above) side = 'bottom'
      if (side === 'bottom' && below < height && above > below) side = 'top'
      const x = Math.max(minX, Math.min(bounds.left + bounds.width / 2 - width / 2, maxX))
      const y = Math.max(minY, Math.min(side === 'top' ? bounds.top - height - 10 : bounds.bottom + 10, maxY - height))
      const arrowX = Math.max(12, Math.min(bounds.left + bounds.width / 2 - x, width - 12))
      tooltip.style.setProperty('--tooltip-x', `${x}px`)
      tooltip.style.setProperty('--tooltip-y', `${y}px`)
      tooltip.style.setProperty('--tooltip-arrow-x', `${arrowX}px`)
      tooltip.dataset.placement = side
    }

    function schedulePosition() {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(position)
    }

    position()
    const observer = new ResizeObserver(schedulePosition)
    if (anchor) observer.observe(anchor)
    observer.observe(tooltip)
    const panel = anchor?.closest('.context-panel')
    if (panel) observer.observe(panel)
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
  }, [anchorRef, tooltipRef, visible, placement, message, point])
}
