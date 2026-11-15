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
