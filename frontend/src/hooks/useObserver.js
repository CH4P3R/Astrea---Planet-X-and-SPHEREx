import { useCallback, useEffect, useRef, useState } from 'react'

export default function useObserver({ initialObserver = null, automatic = true } = {}) {
  const [observer, setObserver] = useState(initialObserver)
  const [status, setStatus] = useState(initialObserver ? 'ready' : 'loading')
  const [error, setError] = useState('')
  const request = useRef(0)
  const timer = useRef(null)

  const locate = useCallback(() => {
    const id = ++request.current
    window.clearTimeout(timer.current)
    setError('')
    if (!navigator.geolocation || !window.isSecureContext) {
      setStatus('error')
      setError('location.errors.unsupported')
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
    timer.current = window.setTimeout(() => fail('location.errors.timeout'), 12000)
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (request.current !== id) return
      request.current += 1
      window.clearTimeout(timer.current)
      setObserver({ latitude: coords.latitude, longitude: coords.longitude, source: 'device' })
      setStatus('ready')
      setError('')
    }, ({ code }) => {
      fail(code === 1 ? 'location.errors.denied'
        : code === 3 ? 'location.errors.timeout' : 'location.errors.unavailable')
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
    const automaticRequest = automatic ? window.setTimeout(() => {
      if (request.current === initialRequest) locate()
    }, 0) : null
    return () => {
      window.clearTimeout(automaticRequest)
      window.clearTimeout(timer.current)
      request.current += 1
    }
  }, [locate, automatic])

  return { observer, status, error, locate, applyManualLocation }
}
