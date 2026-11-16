import { useCallback, useRef, useState } from 'react'
import AppWorkspace from './AppWorkspace.jsx'
import { saveTourStatus } from '../onboarding/tourState.js'
import WelcomeModal from '../onboarding/WelcomeModal.jsx'
import StartupSplash from '../onboarding/StartupSplash.jsx'
import { saveWelcomeStatus, shouldShowWelcome } from '../onboarding/welcomeState.js'
import { parseSkyUrl } from '../../share/skyUrl.js'

export default function AppViewport() {
  const [welcomeOpen, setWelcomeOpen] = useState(() => {
    if (parseSkyUrl(window.location.href).status !== 'none') return false
    try { return shouldShowWelcome(window.localStorage) } catch { return true }
  })
  const [loading, setLoading] = useState(welcomeOpen)
  const [welcomeVisible, setWelcomeVisible] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const [destination, setDestination] = useState(null)
  const [revealedDestination, setRevealedDestination] = useState(null)
  const destinationRef = useRef(null)
  const finishLoading = useCallback(() => setLoading(false), [])
  const revealWelcome = useCallback(() => setWelcomeVisible(true), [])
  const finishWelcome = useCallback(() => {
    const next = destinationRef.current
    if (!next) return
    destinationRef.current = null
    try { saveWelcomeStatus(window.localStorage) } catch { /* Conserva la decision en memoria */ }
    setWelcomeOpen(false)
    setDestination(null)
    setRevealedDestination(next)
    if (next === 'tour') setTourOpen(true)
    if (next === 'explore') {
      requestAnimationFrame(() => document.querySelector('.app-viewport:not([data-tutorial])')?.focus({ preventScroll: true }))
    }
  }, [])
  const leaveWelcome = useCallback((next) => {
    if (destinationRef.current) return
    destinationRef.current = next
    setDestination(next)
  }, [])
  const startTour = useCallback(() => {
    if (welcomeOpen) leaveWelcome('tour')
    else setTourOpen(true)
  }, [welcomeOpen, leaveWelcome])
  const explore = useCallback(() => leaveWelcome('explore'), [leaveWelcome])
  const finishTour = useCallback((status) => {
    try { saveTourStatus(window.localStorage, status) } catch { /* Conserva la decision en memoria */ }
    setTourOpen(false)
    requestAnimationFrame(() => document.querySelector('.app-viewport:not([data-tutorial]) [data-tour-launcher]')?.focus({ preventScroll: true }))
  }, [])

  return <>
    <AppWorkspace suspended={tourOpen} covered={welcomeOpen || loading}
      revealing={revealedDestination === 'explore'} onStartTour={startTour} />
    {welcomeOpen && <WelcomeModal onTutorial={startTour} onExplore={explore} loading={loading}
      visible={welcomeVisible} closing={Boolean(destination)} onExited={finishWelcome} />}
    {loading && <StartupSplash onReveal={revealWelcome} onFinish={finishLoading} />}
    {tourOpen && <AppWorkspace tutorial guideVisible={!welcomeOpen} revealing={revealedDestination === 'tour'} onFinishTour={finishTour} />}
  </>
}
