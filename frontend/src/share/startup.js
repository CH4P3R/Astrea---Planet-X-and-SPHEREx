import { shouldStartTour } from '../components/onboarding/tourState.js'
import { parseSkyUrl } from './skyUrl.js'

export function initialTourOpen(href, storage) {
  try {
    if (parseSkyUrl(href).status !== 'none') return false
  } catch { /* Fall back to ordinary startup for an unreadable URL. */ }
  return shouldStartTour(storage)
}
