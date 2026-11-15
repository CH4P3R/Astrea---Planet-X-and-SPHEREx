import PanelContent from '../common/PanelContent.jsx'
import useTranslation from '../../i18n/useTranslation.js'

export default function SkyControls({ stars, surfaceVisible, setSurfaceVisible }) {
  const { t } = useTranslation()
  const status = stars.status === 'idle' ? t('sky.status.idle')
    : stars.status === 'loading' ? t('sky.status.loading')
      : stars.snapshot ? t('sky.status.ready', { count: stars.snapshot.star_count })
        : t('sky.status.unavailable')

  return <PanelContent title={t('sky.title')}
    header={<p className="context-note" role="status">{status}</p>}
    footer={stars.status === 'error' && <button type="button" onClick={stars.retry}>{t('sky.retry')}</button>}>
    <label className="sky-surface-toggle">
      <input type="checkbox" checked={surfaceVisible} onChange={(event) => setSurfaceVisible(event.target.checked)}
        aria-describedby="sky-surface-help" />
      <span>{t('sky.surface.label')}</span>
    </label>
    <p id="sky-surface-help" className="context-note">{t('sky.surface.help')}</p>
    {stars.error && <p role="alert">{t(stars.error)}</p>}
  </PanelContent>
}
