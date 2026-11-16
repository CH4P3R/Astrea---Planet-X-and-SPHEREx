import { useId } from 'react'
import HelpButton from '../common/HelpButton.jsx'
import ObservationDate from '../controls/ObservationDate.jsx'
import useTranslation from '../../i18n/useTranslation.js'

export default function ComparisonTimeline({ frames, playback, reason, loading, onRemove, onClear }) {
  const { t, number } = useTranslation()
  const id = useId()
  const index = Math.max(0, frames.findIndex((frame) => frame.id === playback.frameId))
  const current = frames[index]
  if (!current) return null
  const metadata = current.image.metadata
  const blocked = Boolean(reason) || frames.length < 2
  const currentDescription = t('inspector.compare.current', {
    frame: current.label, index: number(index + 1), count: number(frames.length),
  })
  return <div className="comparison-timeline">
    <div className="comparison-timeline-current" data-observation-id={current.id}>
      <div className="comparison-section-heading">
        <span className="comparison-timeline-title">
          <strong>{t(current.reference ? 'inspector.compare.reference' : 'inspector.compare.frame', { frame: current.label })}</strong>
          <HelpButton label={t('inspector.compare.sequence')} message={t('inspector.help.comparison')} />
        </span>
        <span className="comparison-timeline-index">{number(index + 1)} / {number(frames.length)}</span>
      </div>
      <div className="comparison-observation">
        <ObservationDate value={metadata.observation.start_utc} />
        <span className="context-note">D{metadata.detector ?? '—'} · {metadata.collection}</span>
      </div>
    </div>
    <input id={id} className="comparison-timeline-slider" type="range" min={0} max={Math.max(0, frames.length - 1)} step={1}
      value={index} disabled={blocked} aria-label={t('inspector.compare.timeline')} aria-valuetext={currentDescription}
      aria-describedby={`${id}-hint`} onPointerDown={playback.pause} onKeyDown={playback.pause}
      onChange={(event) => { playback.pause(); playback.show(frames[Number(event.target.value)].id) }} />
    <p id={`${id}-hint`} className="comparison-timeline-hint context-note">
      {frames.length < 2 ? t('inspector.compare.needPartner') : t('inspector.compare.scrubHint')}
    </p>
    {reason && frames.length > 1 && <p role="status" className="comparison-timeline-status context-note">{reason}</p>}
    {frames.length > 1 && <div className="comparison-timeline-actions">
      <button type="button" className="text-action" disabled={current.reference || loading}
        aria-label={t('inspector.compare.removeFrame', { frame: current.label })}
        onClick={() => onRemove(current.id)}>{t('inspector.compare.remove')}</button>
      <button type="button" className="text-action" disabled={loading} onClick={onClear}>{t('inspector.compare.clear')}</button>
    </div>}
  </div>
}
