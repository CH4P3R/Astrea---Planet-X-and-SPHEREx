import { useCallback, useState } from 'react'
import AppWorkspace from './AppWorkspace.jsx'
import { saveTourStatus } from '../onboarding/tourState.js'
import { initialTourOpen } from '../../share/startup.js'

export default function AppViewport() {
  const [tourOpen, setTourOpen] = useState(() => {
    let storage
    try { storage = window.localStorage } catch { /* Keep shared-link precedence when storage is blocked. */ }
    return initialTourOpen(window.location.href, storage)
  })
  const startTour = useCallback(() => setTourOpen(true), [])
  const finishTour = useCallback((status) => {
    try { saveTourStatus(window.localStorage, status) } catch { /* Conserva la decision en memoria */ }
    setTourOpen(false)
    requestAnimationFrame(() => document.querySelector('.app-viewport:not([data-tutorial]) [data-tour-launcher]')?.focus({ preventScroll: true }))
  }, [])

  return <>
    <AppWorkspace suspended={tourOpen} onStartTour={startTour} />
    {tourOpen && <AppWorkspace tutorial onFinishTour={finishTour} />}
  </>
}
