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
