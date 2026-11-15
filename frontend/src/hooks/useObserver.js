import { useCallback, useEffect, useRef, useState } from 'react'

export default function useObserver() {
  const [observer, setObserver] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const request = useRef(0)
  const timer = useRef(null)

  const locate = useCallback(() => {
    const id = ++request.current
    window.clearTimeout(timer.current)
    setError('')
    if (!navigator.geolocation || !window.isSecureContext) {
      setStatus('error')
      setError('La ubicación automática necesita HTTPS o localhost. Introduce latitud y longitud en Ubicación o busca por RA/Dec en Preparación.')
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
    timer.current = window.setTimeout(() => fail('No se obtuvo la ubicación a tiempo. Reintenta o introduce latitud y longitud en Ubicación.'), 12000)
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (request.current !== id) return
      request.current += 1
      window.clearTimeout(timer.current)
      setObserver({ latitude: coords.latitude, longitude: coords.longitude, source: 'device' })
      setStatus('ready')
      setError('')
    }, ({ code }) => {
      fail(code === 1 ? 'No se concedió permiso de ubicación. Permítelo en el navegador o introduce latitud y longitud en Ubicación.'
        : code === 3 ? 'No se obtuvo la ubicación a tiempo. Reintenta o introduce latitud y longitud en Ubicación.'
          : 'El dispositivo no pudo determinar tu ubicación. Reintenta o introduce latitud y longitud en Ubicación.')
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
    const initialRequest = request.current
    const automatic = window.setTimeout(() => {
      if (request.current === initialRequest) locate()
    }, 0)
    return () => {
      window.clearTimeout(automatic)
      window.clearTimeout(timer.current)
      request.current += 1
    }
  }, [locate])

  return { observer, status, error, locate, applyManualLocation }
}
