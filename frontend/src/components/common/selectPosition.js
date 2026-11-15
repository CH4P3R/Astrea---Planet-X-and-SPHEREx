const clamp = (value, min, max) => Math.max(min, Math.min(value, max))

export function selectPosition({ anchor, width, height, viewport, obstacles = [], placement = 'auto', gap = 8, margin = 12 }) {
  const left = viewport.left + margin
  const right = viewport.left + viewport.width - margin
  const top = viewport.top + margin
  const bottom = viewport.top + viewport.height - margin
  const menuWidth = Math.max(0, Math.min(width, right - left))
  const preferred = placement === 'top' ? 'top' : 'bottom'
  const baseX = clamp(anchor.left, left, right - menuWidth)
  const positions = [...new Set([baseX, clamp(anchor.right - menuWidth, left, right - menuWidth),
    ...obstacles.flatMap((rect) => [rect.right + gap, rect.left - menuWidth - gap])
      .map((x) => clamp(x, left, right - menuWidth))])]
    .filter((x) => x < anchor.right && x + menuWidth > anchor.left)

  function candidates(rects) {
    return (positions.length ? positions : [baseX]).flatMap((x) => {
      let upper = top
      let lower = bottom
      for (const rect of rects) {
        if (rect.right <= x || rect.left >= x + menuWidth) continue
        if (rect.top < anchor.top) upper = Math.max(upper, Math.min(anchor.top, rect.bottom + gap))
        if (rect.bottom > anchor.bottom) lower = Math.min(lower, Math.max(anchor.bottom, rect.top - gap))
      }
      return [
        { side: 'top', available: Math.max(0, anchor.top - gap - upper), x },
        { side: 'bottom', available: Math.max(0, lower - anchor.bottom - gap), x },
      ]
    }).sort((a, b) => {
      const aFits = a.available >= height
      const bFits = b.available >= height
      if (aFits !== bFits) return Number(bFits) - Number(aFits)
      if (!aFits && a.available !== b.available) return b.available - a.available
      if (a.side !== b.side) return Number(b.side === preferred) - Number(a.side === preferred)
      return Math.abs(a.x - baseX) - Math.abs(b.x - baseX)
    })
  }

  let best = candidates(obstacles)[0]
  // En espacios estrechos, superpone el contenido antes de ocultar las opciones
  if (best.available < Math.min(height, 56)) best = candidates([])[0]
  const menuHeight = Math.min(height, best.available)
  return {
    x: best.x,
    y: clamp(best.side === 'top' ? anchor.top - gap - menuHeight : anchor.bottom + gap, top, bottom - menuHeight),
    width: menuWidth, maxHeight: best.available, side: best.side,
  }
}
