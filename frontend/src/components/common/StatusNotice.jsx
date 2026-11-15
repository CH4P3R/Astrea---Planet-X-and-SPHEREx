import { useEffect, useState } from 'react'
import { CheckRounded, Loading2Line } from './StatusIcons.jsx'
import useTranslation from '../../i18n/useTranslation.js'

export default function StatusNotice({ notice, duration = 3200 }) {
  const { t } = useTranslation()
  const [presented, setPresented] = useState(notice)
  const [dismissed, setDismissed] = useState(null)
  const visible = Boolean(notice) && notice !== dismissed

  // Conserva el ultimo contenido durante la salida
  if (notice && notice !== presented) setPresented(notice)

  useEffect(() => {
    if (!notice || notice.status === 'loading' || duration <= 0) return
    const timer = window.setTimeout(() => setDismissed(notice), duration)
    return () => window.clearTimeout(timer)
  }, [notice, duration])

  const loading = presented?.status === 'loading'

  return <div className="status-notice">
    <span className="status-notice-announcement" role="status" aria-live="polite" aria-atomic="true">
      {visible ? t(notice.message) : ''}
    </span>
    <div className="status-notice-surface" data-visible={visible} aria-hidden="true">
      <span key={presented?.status} className={`status-notice-icon status-notice-icon-${loading ? 'loading' : 'success'}`}>
        {loading ? <Loading2Line /> : <CheckRounded />}
      </span>
      <p className="status-notice-message">{t(presented?.message)}</p>
    </div>
  </div>
}
