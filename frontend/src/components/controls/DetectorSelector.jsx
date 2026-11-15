import { useId } from 'react'
import { ANY_DETECTOR, DETECTORS } from '../../config/search.js'
import { SPECTRAL_BANDS, SPECTRAL_CHANNELS } from '../../config/spectralChannels.js'
import useTranslation from '../../i18n/useTranslation.js'
import '../../styles/components/detector-spectrum.css'

const detectorBands = DETECTORS.map((detector) => ({
  ...detector,
  ...SPECTRAL_BANDS.find((band) => band.detector === detector.value),
  channels: SPECTRAL_CHANNELS.filter((channel) => channel.detector === detector.value),
}))
// Preserve proportional widths while keeping narrow-screen targets usable.
const bandColumns = detectorBands.map(({ low, high }) => `minmax(24px, ${high - low}fr)`).join(' ')

export default function DetectorSelector({ value, onChange, disabled }) {
  const { t } = useTranslation()
  const name = useId()
  return <fieldset className="detector-field" disabled={disabled} aria-description={t('inspector.detectors.spectrumDescription')}>
    <legend>{t('inspector.detectors.title')}</legend>
    <div className="detector-segments" style={{ gridTemplateColumns: bandColumns }}>
      {detectorBands.map(({ value: detector, range, low, high, channels }) => <label key={detector}
        className={`detector-segment detector-${detector}`} title={t('search.fields.detector.option', { detector, range })}>
        <input type="radio" name={name} value={detector} checked={value === detector}
          onChange={() => onChange(detector)} aria-label={t('search.fields.detector.option', { detector, range })} />
        <span className="detector-label">D{detector}</span>
        <span className="detector-color">
          <svg className="detector-channel-strip" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true">
            {channels.slice(1).map((channel) => {
              const position = (channel.low - low) / (high - low) * 1000
              return <line key={channel.id} x1={position} x2={position} y1="0" y2="40" />
            })}
          </svg>
          <svg className="detector-selected-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-8" /></svg>
        </span>
      </label>)}
    </div>
    <button type="button" className="text-action" onClick={() => onChange(ANY_DETECTOR)}>{t('inspector.detectors.latest')}</button>
  </fieldset>
}
