import { apiMessages } from './apiMessages.js'

export class LocalizedError extends Error {
  constructor(key, values = {}, options) {
    super(key, options)
    this.name = 'LocalizedError'
    this.key = key
    this.values = values
  }
}

export function errorMessage(error) {
  if (error instanceof LocalizedError) return { key: error.key, values: error.values }
  return { key: error instanceof TypeError ? 'errors.network' : 'errors.unexpected' }
}

export function apiError(status, detail) {
  const key = apiMessages.get(detail)
    ?? ([400, 404, 413, 422, 502, 503, 504].includes(status) ? `errors.http.${status}` : 'errors.api')
  const error = new LocalizedError(key, { status: String(status) })
  // Conserva el detalle tecnico sin presentarlo como texto sin traducir
  error.detail = detail
  if (typeof detail === 'string') error.message = detail
  return error
}
