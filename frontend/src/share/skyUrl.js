import { ANY_DETECTOR, DEFAULT_CUTOUT_SIZE } from '../config/search.js'

export const SKY_PARAMETERS = Object.freeze(['ra', 'dec', 'size', 'detector'])

const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
const INTEGER_PATTERN = /^[+-]?\d+$/

function parseNumber(raw) {
  if (!NUMBER_PATTERN.test(raw)) return null
  const value = Number(raw)
  return Number.isFinite(value) ? (value === 0 ? 0 : value) : null
}

export function parseSkyUrl(href) {
  const { searchParams } = new URL(href)
  if (!SKY_PARAMETERS.some((key) => searchParams.has(key))) return { status: 'none' }

  for (const key of SKY_PARAMETERS) {
    if (searchParams.getAll(key).length > 1) return { status: 'invalid' }
  }

  const raRaw = searchParams.get('ra')
  const decRaw = searchParams.get('dec')
  if (raRaw === null || decRaw === null) return { status: 'invalid' }

  const ra = parseNumber(raRaw)
  if (ra === null || ra < 0 || ra >= 360) return { status: 'invalid' }

  const dec = parseNumber(decRaw)
  if (dec === null || dec < -90 || dec > 90) return { status: 'invalid' }

  const sizeRaw = searchParams.get('size')
  let size = DEFAULT_CUTOUT_SIZE
  if (sizeRaw !== null) {
    size = parseNumber(sizeRaw)
    if (size === null || size < 0.1 || size > 30) return { status: 'invalid' }
  }

  const detectorRaw = searchParams.get('detector')
  let detector = ANY_DETECTOR
  if (detectorRaw !== null) {
    if (!INTEGER_PATTERN.test(detectorRaw)) return { status: 'invalid' }
    detector = Number(detectorRaw)
    if (!Number.isInteger(detector) || detector < 0 || detector > 6) return { status: 'invalid' }
    detector = detector === 0 ? 0 : detector
  }

  return { status: 'valid', search: { ra, dec, size, detector } }
}

export function serializeSkySearch(search) {
  const params = new URLSearchParams()
  for (const key of SKY_PARAMETERS) params.append(key, String(search[key]))
  return params.toString()
}

export function buildShareUrl(href, search) {
  const url = new URL(href)
  url.search = serializeSkySearch(search)
  url.hash = ''
  return url.toString()
}

export function syncSkyUrl(href, search) {
  const url = new URL(href)
  for (const key of SKY_PARAMETERS) url.searchParams.delete(key)
  if (search) {
    for (const key of SKY_PARAMETERS) url.searchParams.append(key, String(search[key]))
  }
  return url.toString()
}
