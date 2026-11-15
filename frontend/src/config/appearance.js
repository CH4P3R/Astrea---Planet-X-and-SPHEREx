export const DEFAULT_APPEARANCE = { palette: 'gray', exposure: 0, opacity: 1 }
export const DEFAULT_PROCESSING = { mask_flags: false, subtract_zodi: false, signal_to_noise: false }

export function compatibleUnits(first, second) {
  const a = first?.metadata.image.unit?.trim()
  const b = second?.metadata.image.unit?.trim()
  return Boolean(a && b && a === b)
}
