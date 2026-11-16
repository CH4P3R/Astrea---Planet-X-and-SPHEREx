import { useEffect, useState } from 'react'
import { Cancel, CheckRounded, Loading2Line, NoResultsOutlineBold, StarLoading } from './StatusIcons.jsx'
import useTranslation from '../../i18n/useTranslation.js'

const statusIcons = {
  loading: Loading2Line,
  success: CheckRounded,
  error: NoResultsOutlineBold,
  cancelled: Cancel,
  empty: NoResultsOutlineBold,
  warning: NoResultsOutlineBold,
}

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

  const status = presented?.status ?? 'loading'
  const Icon = presented?.icon === 'star' ? StarLoading : statusIcons[status] ?? NoResultsOutlineBold

  return <div className="status-notice" data-image-obstacle={visible || undefined}>
    <span className="status-notice-announcement" role="status" aria-live="polite" aria-atomic="true">
      {visible ? t(notice.message) : ''}
    </span>
    <div className="status-notice-surface" data-visible={visible} data-status={status} aria-hidden="true">
      <span key={`${status}:${presented?.icon ?? 'default'}`} className={`status-notice-icon status-notice-icon-${status}`}>
        <Icon />
      </span>
      <p className="status-notice-message">{t(presented?.message)}</p>
    </div>
  </div>
}
