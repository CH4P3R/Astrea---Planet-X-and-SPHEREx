export const DEFAULT_CUTOUT_SIZE = 7

// 0 selects the most recent observation from any detector
export const ANY_DETECTOR = 0
export const DETECTORS = [
  { value: 1, range: '0.75–1.09' }, { value: 2, range: '1.10–1.62' }, { value: 3, range: '1.63–2.41' },
  { value: 4, range: '2.42–3.82' }, { value: 5, range: '3.83–4.41' }, { value: 6, range: '4.42–5.00' },
]

export function cutoutSizeError(size) {
  return typeof size === 'number' && Number.isFinite(size) && size >= 0.1 && size <= 30
    ? '' : 'search.validation.size'
}

export function coordinateError(ra, dec) {
  if (!Number.isFinite(ra) || ra < 0 || ra >= 360) {
    return 'search.validation.ra'
  }
  if (!Number.isFinite(dec) || dec < -90 || dec > 90) {
    return 'search.validation.dec'
  }
  return ''
}
