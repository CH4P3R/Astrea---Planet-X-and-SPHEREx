import { useEffect, useRef, useState } from 'react'
import useTranslation from '../i18n/useTranslation.js'
import Tooltip from '../components/common/Tooltip.jsx'
import Share3 from '../components/common/Share3.jsx'

export default function ShareLink({ getHref, disabled, iconOnly = false }) {
  const { t } = useTranslation()
  const [feedback, setFeedback] = useState(null)
  const request = useRef(0)
  useEffect(() => () => { request.current += 1 }, [getHref, disabled])
  useEffect(() => {
    if (!iconOnly || !feedback || feedback.manual) return
    const timer = window.setTimeout(() => setFeedback(null), 2400)
    return () => window.clearTimeout(timer)
  }, [feedback, iconOnly])
  if (feedback && (feedback.getHref !== getHref || feedback.disabled !== disabled)) setFeedback(null)

  async function copy() {
    if (disabled) return
    const attempt = ++request.current
    const href = getHref()
    setFeedback(null)
    if (!href) return
    let manual = false
    try {
      await navigator.clipboard.writeText(href)
    } catch {
      manual = true
    }
    if (attempt === request.current) setFeedback({ getHref, disabled, href, manual })
  }

  const message = t(feedback ? feedback.manual ? 'share.notices.manual' : 'share.notices.copied' : 'share.actions.copy')
  const control = <button type="button" disabled={disabled} onClick={copy}
    aria-label={iconOnly ? t('share.actions.copy') : undefined} className={iconOnly ? 'share-icon-button' : undefined}>
    {iconOnly ? <Share3 /> : t('share.actions.copy')}
  </button>

  return <div className={`share-link${iconOnly ? ' share-link--icon' : ''}`}>
    {iconOnly ? <Tooltip message={message} open={feedback ? true : undefined} inline
      tone={feedback?.manual ? 'error' : 'info'}>{control}</Tooltip> : control}
    {feedback && <>
      <p role="status" aria-live="polite" className={iconOnly ? 'share-announcement' : undefined}>{t(feedback.manual ? 'share.notices.manual' : 'share.notices.copied')}</p>
      {feedback.manual && <label>{t('share.fallback.label')}
        <input type="text" readOnly value={feedback.href} onFocus={(event) => event.target.select()} />
      </label>}
    </>}
  </div>
}
