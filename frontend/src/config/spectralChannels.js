// Nominal design intervals, not calibrated per-pixel wavelength coverage.
// Hui et al., Spectral response of SPHEREx, Table 1 and equations (1)–(2):
// https://arxiv.org/html/2602.09139v1#S2
// Keep these separate from the archive search ranges in search.js.
export const SPECTRAL_BANDS = [
  { detector: 1, low: 0.75, high: 1.11 },
  { detector: 2, low: 1.11, high: 1.64 },
  { detector: 3, low: 1.64, high: 2.42 },
  { detector: 4, low: 2.42, high: 3.82 },
  { detector: 5, low: 3.82, high: 4.42 },
  { detector: 6, low: 4.42, high: 5.00 },
]

export const SPECTRAL_CHANNELS = SPECTRAL_BANDS.flatMap(({ detector, low, high }) =>
  Array.from({ length: 17 }, (_, index) => ({
    id: (detector - 1) * 17 + index + 1,
    detector,
    low: low * (high / low) ** (index / 17),
    high: index === 16 ? high : low * (high / low) ** ((index + 1) / 17),
  })),
)

// Illustrative infrared palette, not visible-light colors or measured flux.
// Interpolation follows wavelength rather than detector/channel index so the
// progression stays continuous across detectors with different bandwidths.
const SPECTRAL_PALETTE = [
  [0, [115, 82, 224]],
  [0.24, [155, 91, 205]],
  [0.46, [195, 105, 158]],
  [0.67, [224, 128, 111]],
  [0.85, [237, 161, 81]],
  [1, [242, 188, 86]],
]

export function wavelengthColor(wavelength) {
  const low = SPECTRAL_BANDS[0].low
  const high = SPECTRAL_BANDS.at(-1).high
  const position = Math.max(0, Math.min(1, (wavelength - low) / (high - low)))
  const upperIndex = SPECTRAL_PALETTE.findIndex(([stop]) => stop >= position)
  const [upperStop, upperColor] = SPECTRAL_PALETTE[upperIndex]
  const [lowerStop, lowerColor] = SPECTRAL_PALETTE[Math.max(0, upperIndex - 1)]
  const mix = upperStop === lowerStop ? 0 : (position - lowerStop) / (upperStop - lowerStop)
  const color = lowerColor.map((value, index) => Math.round(value + (upperColor[index] - value) * mix))
  return `rgb(${color.join(' ')})`
}
