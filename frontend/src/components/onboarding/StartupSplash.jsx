import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useTranslation from '../../i18n/useTranslation.js'
import { welcomeAssets } from './welcomeState.js'

export default function StartupSplash({ onReveal, onFinish }) {
  const { t } = useTranslation()
  const [fading, setFading] = useState(false)
  const dialogRef = useRef(null)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()
    return () => dialog.close()
  }, [])
  useEffect(() => {
    let cancelled = false
    let fadeTimer
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => {
      if (cancelled) return
      setFading(true)
      onReveal?.()
      fadeTimer = window.setTimeout(onFinish, reducedMotion ? 0 : 500)
    }, reducedMotion ? 0 : 1400)
    return () => { cancelled = true; window.clearTimeout(timer); window.clearTimeout(fadeTimer) }
  }, [onReveal, onFinish])

  return createPortal(<dialog ref={dialogRef} className="startup-splash" data-fading={fading}
    aria-label={t('onboarding.intro.loading')} onCancel={(event) => event.preventDefault()}>
    <div className="startup-icon" style={{ '--astrea-logo-mask': `url("${welcomeAssets.icon}")` }} aria-hidden="true" />
    <span className="startup-label" role="status">{t('onboarding.intro.loading')}</span>
  </dialog>, document.body)
}
