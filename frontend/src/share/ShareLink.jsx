import { useEffect, useRef, useState } from 'react'
import useTranslation from '../i18n/useTranslation.js'
import '../styles/components/share.css'

export default function ShareLink({ getHref, disabled }) {
  const { t } = useTranslation()
  const [feedback, setFeedback] = useState(null)
  const request = useRef(0)
  useEffect(() => () => { request.current += 1 }, [getHref, disabled])
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

  return <div className="share-link">
    <button type="button" disabled={disabled} onClick={copy}>{t('share.actions.copy')}</button>
    {feedback && <>
      <p role="status" aria-live="polite">{t(feedback.manual ? 'share.notices.manual' : 'share.notices.copied')}</p>
      {feedback.manual && <label>{t('share.fallback.label')}
        <input type="text" readOnly value={feedback.href} onFocus={(event) => event.target.select()} />
      </label>}
    </>}
  </div>
}
