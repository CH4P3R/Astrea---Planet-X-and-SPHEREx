export const DEFAULT_CUTOUT_SIZE = 7

export function cutoutSizeError(size) {
  return typeof size === 'number' && Number.isFinite(size) && size >= 0.1 && size <= 30
    ? '' : 'Introduce un tamaño de entre 0,1 y 30 minutos de arco en Preparación.'
}

export function coordinateError(ra, dec) {
  if (!Number.isFinite(ra) || ra < 0 || ra >= 360) {
    return 'La ascensión recta (RA) debe estar entre 0° y menos de 360°.'
  }
  if (!Number.isFinite(dec) || dec < -90 || dec > 90) {
    return 'La declinación (Dec) debe estar entre −90° y 90°.'
  }
  return ''
}
