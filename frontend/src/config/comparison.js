export function observationTimestamp(value) {
  if (!value) return null
  const utc = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`
  const timestamp = Date.parse(utc)
  return Number.isFinite(timestamp) ? timestamp : null
}

export function comparisonCandidate(reference, candidate, sameDetector) {
  const first = observationTimestamp(reference.observation?.start_utc)
  const second = observationTimestamp(candidate.observation?.start_utc)
  return candidate.id !== reference.id && first !== null && second !== null && first !== second
    && (!sameDetector || (reference.detector != null && candidate.detector === reference.detector))
}

export function observationDay(value) {
  const timestamp = observationTimestamp(value)
  return timestamp === null ? null : new Date(timestamp).toISOString().slice(0, 10)
}

export const MISSION_START_YEAR = 2025
export const BLINK_MIN_SECONDS = 0.1
export const BLINK_MAX_SECONDS = 3
export const BLINK_STEP_SECONDS = 0.1

export function comparisonYears(currentYear = new Date().getUTCFullYear()) {
  if (!Number.isInteger(currentYear) || currentYear < MISSION_START_YEAR) return []
  return Array.from({ length: currentYear - MISSION_START_YEAR + 1 }, (_, index) => currentYear - index)
}

export function comparisonQuery(metadata, year, sameDetector = true) {
  if (!comparisonYears().includes(year)) return null
  // Archive bounds are inclusive; exclude midnight of the following year.
  return { ...metadata.requested, frame: undefined, limit: 100,
    start_time: `${year}-01-01T00:00:00Z`, end_time: `${year}-12-31T23:59:59.999999Z`,
    detector: sameDetector ? metadata.detector : undefined }
}

export function frameLabel(index) {
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError('Invalid frame index')
  let remaining = index + 1
  let label = ''
  while (remaining > 0) {
    remaining -= 1
    label = String.fromCharCode(65 + (remaining % 26)) + label
    remaining = Math.floor(remaining / 26)
  }
  return label
}

export function chronologicalFrames(images) {
  return images.map((image, index) => ({ id: image.metadata.id, label: frameLabel(index), image, reference: index === 0 }))
    .sort((first, second) => {
      const a = observationTimestamp(first.image.metadata.observation?.start_utc)
      const b = observationTimestamp(second.image.metadata.observation?.start_utc)
      if (a === b) return 0
      if (a === null) return 1
      if (b === null) return -1
      return a - b
    })
}

export function nextFrameId(frames, currentId, direction = 1) {
  if (!frames.length) return null
  const current = frames.findIndex(({ id }) => id === currentId)
  const reference = frames.findIndex(({ reference: isReference }) => isReference)
  const index = current < 0 ? Math.max(0, reference) : current
  return frames[((index + direction) % frames.length + frames.length) % frames.length].id
}
