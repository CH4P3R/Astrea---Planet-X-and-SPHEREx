import { useLayoutEffect, useRef } from 'react'
import { anchoredPanelPosition, availablePanelBounds } from '../components/common/panelPosition.js'

export default function useAnchoredPanel(anchorId, visible) {
  const panelRef = useRef(null)

  useLayoutEffect(() => {
    const panel = panelRef.current
    const anchor = document.getElementById(anchorId)
    if (!visible || !panel || !anchor) return

    const viewport = window.visualViewport
    const root = panel.closest('.app-viewport')
    const obstacles = [...(root?.querySelectorAll('.sky-clock, .language-region') ?? [])]
    let frame = null

    function position() {
      const styles = window.getComputedStyle(panel)
      const gap = parseFloat(styles.getPropertyValue('--panel-viewport-gap'))
      const arrowInset = parseFloat(styles.getPropertyValue('--panel-arrow-inset'))
      const viewportTop = viewport?.offsetTop ?? 0
      const viewportHeight = viewport?.height ?? window.innerHeight
      const bounds = availablePanelBounds({ top: viewportTop, height: viewportHeight }, panel.getBoundingClientRect(),
        obstacles.map((element) => element.getBoundingClientRect()), gap)
      panel.style.setProperty('--panel-available-height', `${bounds.height}px`)

      const anchorBounds = anchor.getBoundingClientRect()
      const height = panel.offsetHeight
      const { top, arrowY } = anchoredPanelPosition(bounds, anchorBounds, height, arrowInset)
      const parentTop = panel.offsetParent.getBoundingClientRect().top

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
    obstacles.forEach((element) => observer.observe(element))
    const changes = new MutationObserver(schedulePosition)
    if (root) changes.observe(root, { attributes: true, attributeFilter: ['data-inspector-open'] })
    window.addEventListener('resize', schedulePosition)
    window.addEventListener('scroll', schedulePosition, true)
    viewport?.addEventListener('resize', schedulePosition)
    viewport?.addEventListener('scroll', schedulePosition)

    return () => {
      observer.disconnect()
      changes.disconnect()
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedulePosition)
      window.removeEventListener('scroll', schedulePosition, true)
      viewport?.removeEventListener('resize', schedulePosition)
      viewport?.removeEventListener('scroll', schedulePosition)
    }
  }, [anchorId, visible])

  return panelRef
}
