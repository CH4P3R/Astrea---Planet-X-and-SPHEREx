import { useId, useState } from 'react'
import Tooltip from '../common/Tooltip.jsx'
import PanelContent from '../common/PanelContent.jsx'
import InputField from '../common/InputField.jsx'
import { coordinateError, cutoutSizeError } from '../../config/search.js'
import useScrollHint from '../../hooks/useScrollHint.js'
import useTranslation from '../../i18n/useTranslation.js'

export default function FitsControls({ fits, observer, visible }) {
  const { t, date } = useTranslation()
  const formId = useId()
  const [ra, setRa] = useState('')
  const [dec, setDec] = useState('')
  const [validation, setValidation] = useState('')
  const busy = fits.status === 'searching' || fits.status === 'loading'
  const hasResults = fits.images.length > 0
  const scrollRef = useScrollHint(fits.images, visible && !busy && !fits.preparing)
  const sizeError = t(cutoutSizeError(fits.size))
  const projectionReason = !observer
    ? t('search.projectionRequired') : ''

  function submit(event) {
    event.preventDefault()
    if (sizeError || busy) return
    const error = !ra.trim() || !dec.trim() ? 'search.validation.coordinates'
      : coordinateError(Number(ra), Number(dec))
    setValidation(error)
    if (!error) fits.searchByCoordinates(Number(ra), Number(dec))
  }

  function edit(setValue, value) {
    setValue(value)
    setValidation('')
    fits.beginPreparation()
  }

  function observationDate(value) {
    if (!value) return t('search.results.noDate')
    const utc = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`
    return Number.isFinite(Date.parse(utc))
      ? t('search.results.date', { date: date(utc, { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' }) })
      : t('search.results.noDate')
  }

  return <PanelContent title={t('search.title')} scrollRef={scrollRef}
    header={<>
      <InputField label={t('search.fields.size.label')} type="number" min="0.1" max="30" step="0.1"
        value={fits.size}
        help={t('search.fields.size.help')}
        onChange={(event) => fits.setSize(event.target.value === '' ? '' : Number(event.target.value))} />
      {!busy && !hasResults && <p>{t('search.intro')}</p>}
    </>}
    footer={<>
      {fits.active && <p className="context-note" role="status">
        {t('search.imageSummary', { width: fits.active.metadata.image.width,
          height: fits.active.metadata.image.height, unit: fits.active.metadata.image.unit ?? t('search.noUnit') })}
      </p>}
      {!busy && <Tooltip message={sizeError} tone="error">
        <button type="submit" form={formId} aria-disabled={Boolean(sizeError)}
          onClick={(event) => { if (sizeError) event.preventDefault() }}>{t('search.actions.search')}</button>
      </Tooltip>}
      {busy ? <button type="button" onClick={fits.reset}>{t('search.actions.cancel')}</button>
        : fits.preparing ? <button type="button" onClick={() => { fits.cancelPreparation(); setValidation('') }}>
          {t('search.actions.cancelPreparation')}
        </button>
          : (fits.status !== 'idle' || fits.active || hasResults) && <button type="button" onClick={fits.reset}>
            {t('search.actions.clear')}
          </button>}
    </>}>
    <form id={formId} onSubmit={submit}>
      <InputField label={t('search.fields.ra.label')} name="ra" type="number" min="0" max="360" step="any" required
        value={ra} disabled={busy} placeholder={t('search.fields.ra.placeholder')}
        help={t('search.fields.ra.help')}
        onChange={(event) => edit(setRa, event.target.value)} />
      <InputField label={t('search.fields.dec.label')} name="dec" type="number" min="-90" max="90" step="any" required
        value={dec} disabled={busy} placeholder={t('search.fields.dec.placeholder')}
        help={t('search.fields.dec.help')}
        onChange={(event) => edit(setDec, event.target.value)} />
      {validation && <p role="alert">{t(validation)}</p>}
    </form>
    {fits.error && <p role="alert">{t(fits.error)}</p>}
    {!busy && !fits.preparing && fits.status === 'results' && !hasResults && <p role="status">{t('search.results.empty')}</p>}
    {!busy && !fits.preparing && hasResults && <>
      {!fits.active && <p>{t('search.results.choose')}</p>}
      <ul className="fits-results">
        {fits.images.map((image) => <li key={image.id}>
          <Tooltip message={projectionReason} tone="error">
            <button type="button" aria-disabled={Boolean(projectionReason)}
              onClick={() => { if (!projectionReason) fits.load(image.id) }}>
              {t('search.results.observation', { id: image.observation_id || image.id.slice(0, 12),
                detector: image.detector ?? '—', collection: image.collection })}
              <br />{observationDate(image.observation?.start_utc)}
            </button>
          </Tooltip>
        </li>)}
      </ul>
      {fits.hasMore && <p>{t('search.results.limit', { count: fits.images.length })}</p>}
    </>}
  </PanelContent>
}
