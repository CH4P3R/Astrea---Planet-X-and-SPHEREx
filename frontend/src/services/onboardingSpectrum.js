import sample from '../components/onboarding/data/spectrum.json' with { type: 'json' }

// A measurable source in the bundled Barnard field, not the saturated Barnard star.
// Both methods are computed from the local FITS by the generator in provenance.
export const onboardingSpectrumPosition = sample.position

export async function loadOnboardingSpectrum(ra, dec, detector, method, signal) {
  signal?.throwIfAborted()
  if (ra !== sample.position.ra_deg || dec !== sample.position.dec_deg
    || detector !== sample.detector || !Object.hasOwn(sample.responses, method)) {
    throw new RangeError('This spectrum example only covers the tutorial position and detector.')
  }
  return structuredClone(sample.responses[method])
}
