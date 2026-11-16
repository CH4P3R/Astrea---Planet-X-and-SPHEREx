import { useId, useState } from 'react'
import PanelContent from '../common/PanelContent.jsx'
import InputField from '../common/InputField.jsx'
import useTranslation from '../../i18n/useTranslation.js'

export default function LocationControls({ observer, status, error, locate, applyManualLocation }) {
  const { t, number } = useTranslation()
  const [validation, setValidation] = useState('')
  const formId = useId()

  function submit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const latitude = data.get('latitude').trim()
    const longitude = data.get('longitude').trim()
    if (!latitude || !longitude || !applyManualLocation(Number(latitude), Number(longitude))) {
      setValidation('location.validation')
      return
    }
    setValidation('')
  }

  return <PanelContent title={t('location.title')} header={<p role="status">{observer
    ? t('location.coordinates', {
      source: t(`location.source.${observer.source}`),
      latitude: number(observer.latitude, { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
      longitude: number(observer.longitude, { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
    }) : t('location.intro')}</p>}
    footer={<>
      <button type="button" onClick={locate} disabled={status === 'loading'}>
        {t(status === 'loading' ? 'location.actions.locating' : 'location.actions.device')}
      </button>
      <button type="submit" form={formId}>{t('location.actions.apply')}</button>
    </>}>
    {error && <p role="alert">{t(error)}</p>}
    {observer?.source === 'default' && <p className="context-note">{t('location.notices.defaultReference')}</p>}
    <form key={`${observer?.latitude}:${observer?.longitude}`} id={formId} onSubmit={submit}>
      <InputField label={t('location.latitude.label')} name="latitude" type="number" min="-90" max="90" step="any" required
        defaultValue={observer?.latitude} placeholder={t('location.latitude.placeholder')}
        help={t('location.latitude.help')} />
      <InputField label={t('location.longitude.label')} name="longitude" type="number" min="-180" max="180" step="any" required
        defaultValue={observer?.longitude} placeholder={t('location.longitude.placeholder')}
        help={t('location.longitude.help')} />
      {validation && <p role="alert">{t(validation)}</p>}
    </form>
  </PanelContent>
}
