import { useLayoutEffect } from 'react'
import { selectPosition } from '../components/common/selectPosition.js'

export default function useSelectPosition(anchorRef, listRef, open, { placement, avoidSelector, boundaryRef, options }) {
  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const list = listRef.current
    if (!open || !anchor || !list) return
    const viewport = window.visualViewport
    const obstacles = avoidSelector ? [...document.querySelectorAll(avoidSelector)]
      .filter((element) => !element.contains(anchor) && !element.contains(list)) : []
    let frame

    function position() {
      const visible = {
        left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0,
        width: viewport?.width ?? window.innerWidth, height: viewport?.height ?? window.innerHeight,
      }
      const boundary = boundaryRef?.current?.getBoundingClientRect()
      if (boundary) {
        const right = Math.min(visible.left + visible.width, boundary.right)
        const bottom = Math.min(visible.top + visible.height, boundary.bottom)
        visible.left = Math.max(visible.left, boundary.left)
        visible.top = Math.max(visible.top, boundary.top)
        visible.width = Math.max(0, right - visible.left)
        visible.height = Math.max(0, bottom - visible.top)
      }
      const bounds = anchor.getBoundingClientRect()
      const styles = getComputedStyle(list)
      const minWidth = parseFloat(styles.getPropertyValue('--select-min-width')) || 200
      const maxHeight = parseFloat(styles.getPropertyValue('--select-max-height')) || 288
      const width = Math.min(Math.max(bounds.width, minWidth), Math.max(0, visible.width - 24))
      list.style.setProperty('--select-width', `${width}px`)
      const result = selectPosition({
        anchor: bounds, width, height: Math.min(list.scrollHeight, maxHeight), viewport: visible, placement,
        obstacles: obstacles.filter((element) => element.getClientRects().length
          && !element.hidden && element.getAttribute('aria-hidden') !== 'true')
          .map((element) => element.getBoundingClientRect()),
      })
      list.style.setProperty('--select-x', `${result.x}px`)
      list.style.setProperty('--select-y', `${result.y}px`)
      list.style.setProperty('--select-available-height', `${Math.min(maxHeight, result.maxHeight)}px`)
      list.dataset.placement = result.side
    }

    function schedule() {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(position)
    }

    position()
    const resize = new ResizeObserver(schedule)
    const mutation = new MutationObserver(schedule)
    for (const element of [anchor, list, boundaryRef?.current, ...obstacles].filter(Boolean)) resize.observe(element)
    for (const element of obstacles) mutation.observe(element, { attributes: true, attributeFilter: ['aria-hidden', 'hidden', 'data-visible'] })
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    viewport?.addEventListener('resize', schedule)
    viewport?.addEventListener('scroll', schedule)
    return () => {
      window.cancelAnimationFrame(frame)
      resize.disconnect()
      mutation.disconnect()
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
    }
  }, [anchorRef, listRef, open, placement, avoidSelector, boundaryRef, options])
}
