import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_OBSERVER, LOCATION_TIMEOUT_MS } from '../config/location.js'

export default function useObserver({ initialObserver = null, automatic = true } = {}) {
  const [observer, setObserver] = useState(initialObserver)
  const [status, setStatus] = useState(initialObserver ? 'ready' : 'loading')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(null)
  const currentObserver = useRef(initialObserver)
  const request = useRef(0)
  const timer = useRef(null)

  const locate = useCallback(() => {
    const id = ++request.current
    window.clearTimeout(timer.current)
    setError('')
    const fail = (message) => {
      if (request.current !== id) return
      request.current += 1
      window.clearTimeout(timer.current)
      if (automatic && !currentObserver.current) {
        currentObserver.current = DEFAULT_OBSERVER
        setObserver(DEFAULT_OBSERVER)
        setStatus('ready')
        setError('')
        setNotice({ status: 'warning', message: 'location.notices.defaultAssigned' })
      } else {
        setStatus('error')
        setError(message)
      }
    }
    if (!navigator.geolocation || !window.isSecureContext) {
      fail('location.errors.unsupported')
      return
    }
    setStatus('loading')
    timer.current = window.setTimeout(() => fail('location.errors.timeout'), LOCATION_TIMEOUT_MS)
    const success = ({ coords }) => {
      if (request.current !== id) return
      request.current += 1
      window.clearTimeout(timer.current)
      const next = { latitude: coords.latitude, longitude: coords.longitude, source: 'device' }
      currentObserver.current = next
      setObserver(next)
      setStatus('ready')
      setError('')
      setNotice(null)
    }
    const failure = ({ code }) => {
      fail(code === 1 ? 'location.errors.denied'
        : code === 3 ? 'location.errors.timeout' : 'location.errors.unavailable')
    }
    try {
      navigator.geolocation.getCurrentPosition(success, failure,
        { enableHighAccuracy: false, maximumAge: 60000, timeout: LOCATION_TIMEOUT_MS })
    } catch {
      fail('location.errors.unavailable')
    }
  }, [automatic])

  const applyManualLocation = useCallback((latitude, longitude) => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false
    request.current += 1
    window.clearTimeout(timer.current)
    const next = { latitude, longitude, source: 'manual' }
    currentObserver.current = next
    setObserver(next)
    setStatus('ready')
    setError('')
    setNotice(null)
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

  return { observer, status, error, notice, locate, applyManualLocation }
}
