import { useId } from 'react'
import PanelContent from '../common/PanelContent.jsx'
import Select from '../common/Select.jsx'
import HelpButton from '../common/HelpButton.jsx'
import ObservationDate from '../controls/ObservationDate.jsx'
import PlaybackControls from './PlaybackControls.jsx'
import useTranslation from '../../i18n/useTranslation.js'
import { observationTimestamp } from '../../config/comparison.js'

export default function ImageComparisonPanel({ comparison, playback, reason, primary, secondaryProjection }) {
  const { t, number } = useTranslation()
  const id = useId()
  const busy = comparison.status === 'loading'
  const first = observationTimestamp(primary.metadata.observation.start_utc)
  const second = observationTimestamp(comparison.partner?.metadata.observation.start_utc)
  const days = first !== null && second !== null ? Math.abs(second - first) / 86400000 : null
  return <PanelContent title={t('inspector.tabs.compare')}
    footer={comparison.partner && <PlaybackControls playback={playback} reason={reason} />}>
    <section className="inspector-section">
      <h3>{t('inspector.compare.reference')}<HelpButton label={t('inspector.compare.reference')} message={t('inspector.help.comparison')} /></h3>
      <p><ObservationDate value={primary.metadata.observation.start_utc} /></p>
      <div className="inspector-field-heading"><label htmlFor={id}>{t('inspector.compare.criteria')}</label>
        <HelpButton label={t('inspector.compare.criteria')} message={t('inspector.help.criteria')} /></div>
      <Select id={id} label={t('inspector.compare.criteria')} value={comparison.sameDetector ? 'same' : 'any'} disabled={busy}
        options={['same', 'any'].map((value) => ({ value, label: t(`inspector.compare.${value}`) }))}
        onChange={(value) => { playback.show('A'); comparison.setSameDetector(value === 'same') }} />
    </section>
    <section className="inspector-section">
      <h3>{t('inspector.compare.select')}<HelpButton label={t('inspector.compare.select')} message={t('inspector.help.candidates')} /></h3>
      {comparison.status === 'searching' && <p role="status">{t('inspector.compare.searching')}</p>}
      {busy && <p role="status">{t('inspector.compare.loading')}</p>}
      {busy && <button type="button" onClick={comparison.cancel}>{t('search.actions.cancel')}</button>}
      {comparison.error && <p role="alert">{t(comparison.error)}</p>}
      {!busy && comparison.status !== 'searching' && comparison.candidates.length === 0 && <p>{t('inspector.compare.empty')}</p>}
      <ul className="observation-list">
        {comparison.candidates.map((image) => <li key={image.id}><button type="button" disabled={busy}
          aria-pressed={comparison.partner?.metadata.id === image.id}
          onClick={() => { playback.show('A'); comparison.load(image.id) }}>
          <ObservationDate value={image.observation.start_utc} />
          <span className="context-note">D{image.detector ?? '—'} · {image.collection}</span>
        </button></li>)}
      </ul>
      {comparison.hasMore && <p className="context-note">{t('inspector.compare.limited')}</p>}
      {!busy && <button type="button" onClick={comparison.retry}>{t('inspector.compare.refresh')}</button>}
    </section>
    {comparison.partner && <section className="inspector-section">
      <h3>{t('inspector.compare.partner')}</h3>
      <p><ObservationDate value={comparison.partner.metadata.observation.start_utc} /></p>
      {days !== null && <p className="context-note">{t('inspector.compare.separation', { days: number(days, { maximumFractionDigits: 3 }) })}</p>}
      {reason && <p role="status">{reason}</p>}
      {secondaryProjection.error && <div role="alert"><p>{t(secondaryProjection.error)}</p>
        <button type="button" onClick={secondaryProjection.retry}>{t('inspector.actions.retryProjection')}</button></div>}
      <button type="button" onClick={() => { playback.show('A'); comparison.clear() }}>{t('inspector.compare.clear')}</button>
    </section>}
  </PanelContent>
}
