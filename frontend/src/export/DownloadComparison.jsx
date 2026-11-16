import { useEffect, useRef, useState } from 'react'
import Tooltip from '../components/common/Tooltip.jsx'
import DownloadRounded from '../components/common/DownloadRounded.jsx'
import useTranslation from '../i18n/useTranslation.js'
import { createComparisonGif, downloadGif } from './comparisonGif.js'

export default function DownloadComparison({ images, appearance, interval, disabled, projections, getRenderSnapshot }) {
  const { t } = useTranslation()
  const [feedback, setFeedback] = useState(null)
  const job = useRef(null)
  const { pixels, settings } = appearance
  useEffect(() => () => {
    job.current?.abort()
  }, [images, pixels, settings, interval, disabled])
  const matches = feedback?.images === images && feedback?.pixels === pixels && feedback?.settings === settings
    && feedback?.interval === interval && feedback?.disabled === disabled
  const status = matches ? feedback.status : 'idle'

  async function download() {
    if (disabled || job.current) return
    const controller = new AbortController()
    job.current = controller
    const update = (value) => setFeedback({ images, pixels, settings, interval, disabled, status: value })
    update('loading')
    try {
      const projectedImages = images.map((image) => projections?.byId[image.metadata.id]?.image ?? image)
      const renderedFrame = getRenderSnapshot?.()
      if (getRenderSnapshot && !renderedFrame) throw new Error('GIF renderer is unavailable')
      const blob = await createComparisonGif(images, pixels, settings, interval, controller.signal, { projectedImages, renderedFrame })
      controller.signal.throwIfAborted()
      downloadGif(blob)
      update('saved')
    } catch {
      if (!controller.signal.aborted) update('error')
    } finally {
      if (job.current === controller) {
        job.current = null
        if (controller.signal.aborted) update('idle')
      }
    }
  }

  const loading = status === 'loading'
  const message = t(`share.gif.${disabled ? 'unavailable' : loading ? 'loading' : status === 'error' ? 'error' : 'download'}`)
  return <div className="gif-download">
    <Tooltip message={message} inline tone={status === 'error' ? 'error' : 'info'}>
      <button type="button" className="share-icon-button" aria-label={t('share.gif.download')}
        aria-busy={loading} disabled={disabled || loading} onClick={download}><DownloadRounded /></button>
    </Tooltip>
    <span role={status === 'error' ? 'alert' : 'status'} aria-live={status === 'error' ? 'assertive' : 'polite'} className="share-announcement">
      {status !== 'idle' && !disabled ? t(`share.gif.${status}`) : ''}
    </span>
  </div>
}
