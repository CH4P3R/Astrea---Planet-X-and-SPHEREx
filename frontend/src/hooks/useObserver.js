import { useCallback, useEffect, useRef, useState } from 'react'

export default function useObserver() {
  const [observer, setObserver] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const request = useRef(0)
  const timer = useRef(null)

  const locate = useCallback(() => {
    const id = ++request.current
    window.clearTimeout(timer.current)
    setError('')
    if (!navigator.geolocation || !window.isSecureContext) {
      setStatus('error')
      setError('La ubicación automática necesita HTTPS o localhost. Introduce tu ubicación manualmente.')
      return
    }
    setStatus('loading')
    const fail = (message) => {
      if (request.current !== id) return
      request.current += 1
      window.clearTimeout(timer.current)
      setStatus('error')
      setError(message)
    }
    timer.current = window.setTimeout(() => fail('La ubicación está tardando demasiado. Puedes introducirla manualmente.'), 12000)
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (request.current !== id) return
      request.current += 1
      window.clearTimeout(timer.current)
      setObserver({ latitude: coords.latitude, longitude: coords.longitude, source: 'device' })
      setStatus('ready')
      setError('')
    }, ({ code }) => {
      fail(code === 1 ? 'No se concedió permiso de ubicación. Puedes usar la entrada manual.'
        : 'No se pudo obtener la ubicación. Reintenta o introduce las coordenadas.')
    }, { enableHighAccuracy: false, maximumAge: 60000, timeout: 12000 })
  }, [])

  const applyManualLocation = useCallback((latitude, longitude) => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false
    request.current += 1
    window.clearTimeout(timer.current)
    setObserver({ latitude, longitude, source: 'manual' })
    setStatus('ready')
    setError('')
    return true
  }, [])

  useEffect(() => {
    // Scheduling also prevents duplicate requests during StrictMode's effect check.
    const start = window.setTimeout(locate, 0)
    return () => {
      window.clearTimeout(start)
      window.clearTimeout(timer.current)
      request.current += 1
    }
  }, [locate])

  return { observer, status, error, locate, applyManualLocation }
}
