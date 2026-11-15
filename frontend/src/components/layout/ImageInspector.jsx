import { useId } from 'react'
import Tabs from '../common/Tabs.jsx'
import Tooltip from '../common/Tooltip.jsx'
import HelpButton from '../common/HelpButton.jsx'
import InspectorIcon from '../controls/InspectorIcons.jsx'
import DetectorSelector from '../controls/DetectorSelector.jsx'
import ObservationDate from '../controls/ObservationDate.jsx'
import ImageDataPanel from '../controls/ImageDataPanel.jsx'
import ImageAppearancePanel from '../controls/ImageAppearancePanel.jsx'
import ImageComparisonPanel from '../blink-hud/ImageComparisonPanel.jsx'
import useTranslation from '../../i18n/useTranslation.js'

export default function ImageInspector({ open, onClose, onOpen, tab, onTabChange, fits, displayed,
  appearance, comparison, playback, reason, primaryProjection, secondaryProjection, onCenter, onNewRegion }) {
  const { t } = useTranslation()
  const id = useId()
  if (!fits.active) return null
  const metadata = displayed.metadata
  const busy = ['searching', 'loading'].includes(fits.status)
  const items = ['data', 'appearance', 'compare'].map((name) => ({ id: name, label: t(`inspector.tabs.${name}`), icon: <InspectorIcon name={name} /> }))
  return <>
    {!open && <button id={`${id}-reopen`} type="button" className="inspector-reopen" data-image-obstacle
      onClick={() => { onOpen(); requestAnimationFrame(() => document.getElementById(`${id}-tab-${tab}`)?.focus()) }}>{t('inspector.actions.open')}</button>}
    <aside className="image-inspector" data-open={open} inert={!open} aria-hidden={!open} aria-label={t('inspector.title')} data-image-obstacle data-select-obstacle>
      <div className="inspector-topbar">
        <Tabs id={id} label={t('inspector.title')} items={items} value={tab} onChange={onTabChange} />
        <Tooltip message={t('inspector.actions.close')} inline><button type="button" className="inspector-close"
          onClick={() => { onClose(); requestAnimationFrame(() => document.getElementById(`${id}-reopen`)?.focus()) }}
          aria-label={t('inspector.actions.close')}><InspectorIcon name="close" /></button></Tooltip>
      </div>
      <div className="inspector-surface">
        <header className="inspector-summary">
          <div className="inspector-observation-heading">
            <div><span className="context-note">{t('inspector.observation')}{comparison.partner ? ` · ${playback.frame}` : ''}</span>
              <strong><ObservationDate value={metadata.observation.start_utc} /></strong></div>
            <HelpButton label={t('inspector.observation')} message={t('inspector.help.observationDate')} />
          </div>
          <div className="inspector-identity">
            <span>{t('inspector.detector', { detector: metadata.detector ?? '—' })}</span>
            <span className="inspector-release"><span>{t('inspector.release', { release: metadata.collection })}</span>
              <HelpButton label={t('inspector.releaseLabel')} message={t('inspector.help.release')} /></span>
          </div>
          <DetectorSelector value={metadata.detector} onChange={(value) => { playback.show('A'); fits.setDetector(value) }} disabled={busy} />
          {Object.values(appearance.appliedProcessing).some(Boolean) && <p className="context-note">
            {t(appearance.appliedProcessing.signal_to_noise ? 'inspector.appearance.dimensionless' : 'inspector.appearance.processed')}
          </p>}
          {tab !== 'appearance' && appearance.loading && <p role="status">{t('inspector.appearance.loading')}</p>}
          {tab !== 'appearance' && appearance.error && <p role="alert">{t('inspector.appearance.failed')}</p>}
          {appearance.ready && !appearance.hasData && <p role="status">{t('inspector.compare.noData')}</p>}
          {busy && <div className="inspector-task"><span>{t(fits.status === 'searching' ? 'search.notices.searching' : 'search.notices.loading')}</span>
            <button type="button" onClick={fits.cancel}>{t('search.actions.cancel')}</button></div>}
          {fits.status === 'results' && !fits.images.length && <p role="status">{t('inspector.detectors.empty')}</p>}
          {fits.error && <p role="alert">{t(fits.error)}</p>}
          {!primaryProjection.ready && !primaryProjection.error && <p role="status">{t('inspector.projection.waiting')}</p>}
          {primaryProjection.error && <div role="alert"><p>{t(primaryProjection.error)}</p>
            <button type="button" onClick={primaryProjection.retry}>{t('inspector.actions.retryProjection')}</button></div>}
        </header>
        <div className="inspector-panels">
          {items.map((item) => <div key={item.id} role="tabpanel" id={`${id}-panel-${item.id}`}
            aria-labelledby={`${id}-tab-${item.id}`} hidden={tab !== item.id} tabIndex={0}>
            {item.id === 'data' && <ImageDataPanel active={displayed} onCenter={onCenter} />}
            {item.id === 'appearance' && <ImageAppearancePanel appearance={appearance} />}
            {item.id === 'compare' && <ImageComparisonPanel comparison={comparison} playback={playback} reason={reason}
              primary={fits.active} secondaryProjection={secondaryProjection} />}
          </div>)}
        </div>
        <div className="inspector-bottom"><button type="button" className="text-action" onClick={onNewRegion}>{t('inspector.actions.newRegion')}</button></div>
      </div>
    </aside>
  </>
}
