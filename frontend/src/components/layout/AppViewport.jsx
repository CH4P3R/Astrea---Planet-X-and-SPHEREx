import { useCallback, useState } from 'react'
import AppWorkspace from './AppWorkspace.jsx'
import { saveTourStatus, shouldStartTour } from '../onboarding/tourState.js'

export default function AppViewport() {
  const [tourOpen, setTourOpen] = useState(() => {
    try { return shouldStartTour(window.localStorage) } catch { return true }
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
