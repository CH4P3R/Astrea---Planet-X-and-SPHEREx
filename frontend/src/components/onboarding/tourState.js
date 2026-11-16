export const tourStorageKey = 'astrea.onboarding.v1'
export const tourOptions = Object.freeze({ scrollTo: false })

export const tourSteps = [
  { id: 'welcome', target: '.context-rail' },
  { id: 'time', target: '[data-tour-panel="time"]', panel: 'time' },
  { id: 'location', target: '[data-tour-panel="location"]', panel: 'location' },
  { id: 'search', target: '[data-tour-panel="search"]', panel: 'search' },
  { id: 'sky', target: '[data-tour-panel="sky"]', panel: 'sky' },
  { id: 'data', target: '.image-inspector', tab: 'data' },
  { id: 'appearance', target: '.image-inspector', tab: 'appearance' },
  { id: 'compare', target: '.image-inspector', tab: 'compare', actionCount: 3 },
  { id: 'spectrum', target: '.image-inspector', tab: 'spectrum', actionCount: 3 },
]

export function shouldStartTour(storage) {
  try {
    return !['completed', 'skipped'].includes(storage?.getItem(tourStorageKey))
  } catch { return true }
}

export function saveTourStatus(storage, status) {
  if (!['completed', 'skipped'].includes(status)) return false
  try {
    storage.setItem(tourStorageKey, status)
    return true
  } catch { return false }
}

export function tourPosition(target, card, viewport) {
  const margin = 12
  const gap = 16
  const width = Math.min(card.width, viewport.width - margin * 2)
  const height = Math.min(card.height, viewport.height - margin * 2)
  const clamp = (value, max) => Math.max(margin, Math.min(value, max - margin))
  const candidates = target ? [
    { left: target.right + gap, top: target.top },
    { left: target.left - width - gap, top: target.top },
    { left: target.left, top: target.bottom + gap },
    { left: target.left, top: target.top - height - gap },
  ] : []
  const next = candidates.find(({ left, top }) => left >= margin && top >= margin
    && left + width <= viewport.width - margin && top + height <= viewport.height - margin)
    ?? { left: (viewport.width - width) / 2, top: viewport.height - height - margin }
  return { left: clamp(next.left, viewport.width - width), top: clamp(next.top, viewport.height - height) }
}
