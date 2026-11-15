export const DEFAULT_CUTOUT_SIZE = 7

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
