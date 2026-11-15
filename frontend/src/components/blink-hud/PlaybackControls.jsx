import RangeField from '../common/RangeField.jsx'
import Tooltip from '../common/Tooltip.jsx'
import useTranslation from '../../i18n/useTranslation.js'

export default function PlaybackControls({ playback, reason }) {
  const { t, number } = useTranslation()
  return <div className="playback-controls">
    <div className="playback-buttons">
      {['A', 'B'].map((frame) => <Tooltip key={frame} message={reason} tone="error">
        <button type="button" aria-pressed={playback.frame === frame} aria-disabled={Boolean(reason)}
          onClick={() => { if (!reason) playback.show(frame) }}>{t('inspector.compare.show', { frame })}</button>
      </Tooltip>)}
      <Tooltip message={reason} tone="error"><button type="button" aria-disabled={Boolean(reason)}
        onClick={() => { if (!reason) playback.toggle() }}>{t(playback.playing ? 'inspector.compare.pause' : 'inspector.compare.play')}</button></Tooltip>
    </div>
    <RangeField label={t('inspector.compare.interval')} help={t('inspector.help.interval')} min={0.5} max={3} step={0.5}
      value={playback.interval} displayValue={`${number(playback.interval)} s`} onChange={playback.setInterval} />
  </div>
}
