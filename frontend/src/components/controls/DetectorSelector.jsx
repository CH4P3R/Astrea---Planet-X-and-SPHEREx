import { useId } from 'react'
import { ANY_DETECTOR, DETECTORS } from '../../config/search.js'
import HelpButton from '../common/HelpButton.jsx'
import useTranslation from '../../i18n/useTranslation.js'

export default function DetectorSelector({ value, onChange, disabled }) {
  const { t } = useTranslation()
  const name = useId()
  return <fieldset className="detector-field" disabled={disabled}>
    <legend>{t('inspector.detectors.title')}<HelpButton label={t('inspector.detectors.title')} message={<>
      {t('inspector.detectors.help')}<br />
      {DETECTORS.map(({ value: detector, range }) => <span key={detector}><br />{t('inspector.detectors.range', { detector, range })}</span>)}
    </>} /></legend>
    <div className="detector-segments">
      {DETECTORS.map(({ value: detector, range }) => <label key={detector} className={`detector-segment detector-${detector}`}>
        <input type="radio" name={name} value={detector} checked={value === detector}
          onChange={() => onChange(detector)} aria-label={t('search.fields.detector.option', { detector, range })} />
        <span className="detector-label">D{detector}</span>
        <span className="detector-color"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-8" /></svg></span>
      </label>)}
    </div>
    <button type="button" className="text-action" onClick={() => onChange(ANY_DETECTOR)}>{t('inspector.detectors.latest')}</button>
  </fieldset>
}
