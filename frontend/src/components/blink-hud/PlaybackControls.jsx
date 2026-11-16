import RangeField from '../common/RangeField.jsx'
import Tooltip from '../common/Tooltip.jsx'
import useTranslation from '../../i18n/useTranslation.js'
import { BLINK_MIN_SECONDS, BLINK_MAX_SECONDS, BLINK_STEP_SECONDS } from '../../config/comparison.js'

export default function PlaybackControls({ playback, reason, frames }) {
  const { t, number } = useTranslation()
  const blocked = Boolean(reason) || frames.length < 2
  return <div className="comparison-playback">
    <div className="comparison-playback-buttons">
      <Tooltip message={reason} tone="error"><button type="button" aria-label={t('inspector.compare.previous')} aria-disabled={blocked}
        onClick={() => { if (!blocked) playback.previous() }}><span aria-hidden="true">←</span></button></Tooltip>
      <Tooltip message={reason} tone="error"><button type="button" aria-label={t('inspector.compare.next')} aria-disabled={blocked}
        onClick={() => { if (!blocked) playback.next() }}><span aria-hidden="true">→</span></button></Tooltip>
      <Tooltip message={reason} tone="error"><button type="button" className="comparison-play-button" aria-disabled={blocked && !playback.playing}
        onClick={() => { if (playback.playing) playback.pause(); else if (!blocked) playback.toggle() }}>{t(playback.playing ? 'inspector.compare.pause' : 'inspector.compare.play')}</button></Tooltip>
    </div>
    <RangeField label={t('inspector.compare.interval')} help={t('inspector.help.interval')}
      min={BLINK_MIN_SECONDS} max={BLINK_MAX_SECONDS} step={BLINK_STEP_SECONDS}
      value={playback.interval} displayValue={`${number(playback.interval)} s`} onChange={playback.setInterval} />
  </div>
}
