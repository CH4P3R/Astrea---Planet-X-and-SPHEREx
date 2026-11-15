import { useState } from 'react'
import PanelContent from '../common/PanelContent.jsx'
import MetadataList from '../common/MetadataList.jsx'
import HelpButton from '../common/HelpButton.jsx'
import useTranslation from '../../i18n/useTranslation.js'

export default function ImageDataPanel({ active, onCenter }) {
  const { t, number } = useTranslation()
  const [headers, setHeaders] = useState(false)
  const { metadata } = active
  const { image, requested } = metadata
  const format = (value, digits = 4) => Number.isFinite(value) ? number(value, { maximumFractionDigits: digits }) : '—'
  const row = (id, value) => ({ id, value, label: t(`inspector.data.${id}`), help: t(`inspector.help.${id}`) })
  const coordinates = (position) => position ? `${format(position.ra_deg, 6)}° / ${format(position.dec_deg, 6)}°` : '—'
  const finite = (1 - image.nonfinite_count / (image.width * image.height)) * 100
  return <PanelContent title={t(headers ? 'inspector.data.headers' : 'inspector.tabs.data')}
    footer={<button type="button" onClick={onCenter}>{t('inspector.actions.center')}</button>}>
    {headers ? <>
      <button type="button" className="text-action" onClick={() => setHeaders(false)}>{t('inspector.actions.back')}</button>
      <p className="context-note">{t('inspector.help.headers')}</p>
      <MetadataList rows={image.wcs_header.map((card, index) => ({ id: `${card.keyword}-${index}`, label: card.keyword,
        value: String(card.value ?? '—'), help: card.comment || undefined }))} />
    </> : <>
      <section className="inspector-section" aria-label={t('inspector.data.basic')}>
        <h3>{t('inspector.data.basic')}<HelpButton label={t('inspector.data.basic')} message={t('inspector.help.basic')} /></h3>
        <MetadataList rows={[
          row('dimensions', `${image.width} × ${image.height} px`),
          row('size', `${format(requested.size_deg * 60, 2)}′`),
          row('coverage', `${format(finite, 1)} %`),
        ]} />
      </section>
      <section className="inspector-section" aria-label={t('inspector.data.technical')}>
        <h3>{t('inspector.data.technical')}<HelpButton label={t('inspector.data.technical')} message={t('inspector.help.technical')} /></h3>
        <MetadataList rows={[
          row('requested', coordinates(requested)), row('center', coordinates(image.center)),
          row('unit', image.unit ?? t('search.noUnit')), row('dtype', image.dtype),
          row('range', `${format(image.finite_min, 6)} / ${format(image.finite_max, 6)}`),
          row('observation', metadata.observation_id),
        ]} />
        <div className="inspector-inline-actions">
          <button type="button" onClick={() => setHeaders(true)}>{t('inspector.data.headers')}</button>
          {/^https?:\/\//i.test(metadata.source_url) && <a href={metadata.source_url} target="_blank" rel="noreferrer">{t('inspector.data.source')}</a>}
        </div>
      </section>
    </>}
  </PanelContent>
}
