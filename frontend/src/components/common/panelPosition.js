export function availablePanelBounds(viewport, panel, obstacles, gap) {
  let top = viewport.top + gap
  let bottom = viewport.top + viewport.height - gap
  const middle = viewport.top + viewport.height / 2
  for (const obstacle of obstacles) {
    if (obstacle.right + gap <= panel.left || obstacle.left - gap >= panel.right) continue
    if ((obstacle.top + obstacle.bottom) / 2 < middle) top = Math.max(top, obstacle.bottom + gap)
    else bottom = Math.min(bottom, obstacle.top - gap)
  }
  bottom = Math.max(top, bottom)
  return { top, bottom, height: bottom - top }
}

export function anchoredPanelPosition(bounds, anchor, height, arrowInset) {
  const inset = Math.min(arrowInset, height / 2)
  const anchorCenter = anchor.top + anchor.height / 2
  const centeredTop = bounds.top + (bounds.height - height) / 2
  const alignedTop = Math.max(anchorCenter - height + inset, Math.min(centeredTop, anchorCenter - inset))
  const top = Math.max(bounds.top, Math.min(alignedTop, Math.max(bounds.top, bounds.bottom - height)))
  const arrowY = Math.max(inset, Math.min(anchorCenter - top, height - inset))
  return { top, arrowY }
}
