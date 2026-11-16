import { useEffect, useState } from 'react'
import useTranslation from '../../i18n/useTranslation.js'
import { welcomeAssets } from './welcomeState.js'

export default function StartupSplash({ onFinish }) {
  const { t } = useTranslation()
  const [fading, setFading] = useState(false)
  useEffect(() => {
    let cancelled = false
    let fadeTimer
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => {
      if (cancelled) return
      setFading(true)
      fadeTimer = window.setTimeout(onFinish, reducedMotion ? 0 : 500)
    }, reducedMotion ? 0 : 1400)
    return () => { cancelled = true; window.clearTimeout(timer); window.clearTimeout(fadeTimer) }
  }, [onFinish])

  return <div className="startup-splash" data-fading={fading} role="status" aria-label={t('onboarding.intro.loading')}>
    <div className="startup-icon" style={{ '--astrea-logo-mask': `url("${welcomeAssets.icon}")` }} aria-hidden="true" />
    <span className="startup-label">{t('onboarding.intro.loading')}</span>
  </div>
}
