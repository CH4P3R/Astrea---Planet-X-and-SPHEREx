import { useState } from 'react'
import PanelContent from '../common/PanelContent.jsx'
import useTranslation from '../../i18n/useTranslation.js'
import '../../styles/components/spectrum.css'

const WIDTH = 640
const HEIGHT = 300
const PLOT = { left: 64, right: 16, top: 12, bottom: 40 }

// A point is doubtful when a quality flag is near the source or part of the
// aperture was dropped. `crowded` alone is not: a bright star's own SOURCE mask
// fills the background ring, and those fluxes still match the 2MASS catalogue.
const doubtful = (point) => point.flags.length > 0 || point.bad_pixels > 0

function ticks(min, max, count = 5) {
  const rough = (max - min) / count
  const power = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 5, 10].map((factor) => factor * power).find((value) => value >= rough)
  const values = []
  for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-9; value += step) values.push(value)
  return { values, digits: Math.max(0, -Math.floor(Math.log10(step))) }
}

// Vertical range from the bulk of the points, so one wild exposure does not flatten the rest.
function fluxRange(points) {
  const lows = points.map((point) => point.flux_ujy - (point.flux_error_ujy ?? 0)).sort((a, b) => a - b)
  const highs = points.map((point) => point.flux_ujy + (point.flux_error_ujy ?? 0)).sort((a, b) => a - b)
  const at = (sorted, fraction) => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]
  const low = Math.min(0, at(lows, 0.05))
  const high = Math.max(0, at(highs, 0.95))
  const margin = (high - low || 1) * 0.08
  return [low - margin, high + margin]
}

// Guide line: at each wavelength, the average of the clean points around it,
// each weighted by its error and by how close it is (a Gaussian one band wide).
// It summarises the measurements; it is not a physical model.
function trend(points, samples = 80) {
  const measured = points.filter((point) => point.flux_error_ujy > 0)
  // Bright or crowded targets may have no clean point at all: the line then
  // follows every measurement and is drawn dashed.
  const trusted = measured.filter((point) => !doubtful(point))
  const uncertain = trusted.length < 3
  const clean = uncertain ? measured : trusted
  if (clean.length < 3) return { line: [], uncertain }
  const widths = clean.map((point) => point.bandwidth_um).sort((a, b) => a - b)
  const reach = widths[Math.floor(widths.length / 2)]
  const first = clean[0].wavelength_um
  const last = clean.at(-1).wavelength_um
  const line = Array.from({ length: samples }, (_, index) => {
    const wave = first + (last - first) * index / (samples - 1)
    let total = 0
    let flux = 0
    for (const point of clean) {
      const weight = Math.exp(-0.5 * ((point.wavelength_um - wave) / reach) ** 2) / point.flux_error_ujy ** 2
      total += weight
      flux += weight * point.flux_ujy
    }
    return { wave, flux: flux / total }
  })
  return { line, uncertain }
}

// `series` is one entry per detector: { detector, points }. Each detector gets
// its own trend line in its own colour; points are indexed across all of them.
function Chart({ series, selected, onSelect }) {
  const { t } = useTranslation()
  const points = series.flatMap((entry) => entry.points)
  const waves = points.map((point) => point.wavelength_um)
  const span = Math.max(...waves) - Math.min(...waves) || 0.1
  const xMin = Math.min(...waves) - span * 0.03
  const xMax = Math.max(...waves) + span * 0.03
  const [yMin, yMax] = fluxRange(points)
  const x = (value) => PLOT.left + (value - xMin) / (xMax - xMin) * (WIDTH - PLOT.left - PLOT.right)
  const y = (value) => HEIGHT - PLOT.bottom - (value - yMin) / (yMax - yMin) * (HEIGHT - PLOT.top - PLOT.bottom)
  const clamp = (value) => Math.min(HEIGHT - PLOT.bottom, Math.max(PLOT.top, y(value)))
  const xTicks = ticks(xMin, xMax)
  const yTicks = ticks(yMin, yMax)
  // Index of each detector's first point within `points`.
  const starts = series.map((entry, index) => series.slice(0, index).reduce((sum, earlier) => sum + earlier.points.length, 0))

  return <svg className="spectrum-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={t('spectrum.chart')}>
    {yTicks.values.map((value) => <g key={value}>
      <line className={value === 0 ? 'spectrum-zero' : 'spectrum-grid'} x1={PLOT.left} x2={WIDTH - PLOT.right} y1={y(value)} y2={y(value)} />
      <text className="spectrum-tick" x={PLOT.left - 8} y={y(value)} textAnchor="end" dominantBaseline="middle">
        {value.toFixed(yTicks.digits)}
      </text>
    </g>)}
    {xTicks.values.map((value) => <text key={value} className="spectrum-tick" x={x(value)} y={HEIGHT - PLOT.bottom + 16} textAnchor="middle">
      {value.toFixed(xTicks.digits)}
    </text>)}
    <text className="spectrum-axis" x={(PLOT.left + WIDTH - PLOT.right) / 2} y={HEIGHT - 6} textAnchor="middle">
      {t('spectrum.wavelengthAxis')}
    </text>
    <text className="spectrum-axis" transform={`translate(14 ${(PLOT.top + HEIGHT - PLOT.bottom) / 2}) rotate(-90)`} textAnchor="middle">
      {t('spectrum.fluxAxis')}
    </text>
    {series.map((entry, order) => {
      const { line, uncertain } = trend(entry.points)
      const first = starts[order]
      const middle = (x(entry.points[0].wavelength_um) + x(entry.points.at(-1).wavelength_um)) / 2
      return <g key={entry.detector} className={`spectrum-series spectrum-detector-${entry.detector}`}>
        {/* The name sits over its own stretch of the axis, so colour is not the only cue. */}
        {series.length > 1 && <text className="spectrum-series-label" x={middle} y={PLOT.top - 2} textAnchor="middle">D{entry.detector}</text>}
        {entry.points.map((point, position) => {
          const index = first + position
          const cx = x(point.wavelength_um)
          const error = point.flux_error_ujy ?? 0
          const outside = point.flux_ujy < yMin || point.flux_ujy > yMax
          return <g key={point.source_url} className={`spectrum-point${doubtful(point) ? ' is-doubtful' : ''}${selected === index ? ' is-selected' : ''}`}>
            {/* Error bar with end caps; a cap is left off where the bar runs past the plot. */}
            {error > 0 && <g className="spectrum-error">
              <line x1={cx} x2={cx} y1={clamp(point.flux_ujy - error)} y2={clamp(point.flux_ujy + error)} />
              {[point.flux_ujy - error, point.flux_ujy + error].filter((value) => value >= yMin && value <= yMax)
                .map((value) => <line key={value} x1={cx - 5} x2={cx + 5} y1={y(value)} y2={y(value)} />)}
            </g>}
            {/* A point beyond the vertical range sits on the edge as a triangle. */}
            {outside
              ? <path className="spectrum-mark" d={point.flux_ujy > yMax
                ? `M${cx - 5} ${PLOT.top + 8}L${cx + 5} ${PLOT.top + 8}L${cx} ${PLOT.top}Z`
                : `M${cx - 5} ${HEIGHT - PLOT.bottom - 8}L${cx + 5} ${HEIGHT - PLOT.bottom - 8}L${cx} ${HEIGHT - PLOT.bottom}Z`} />
              : <circle className="spectrum-mark" cx={cx} cy={y(point.flux_ujy)} r={series.length > 1 ? 2.5 : 3.5} />}
            <circle className="spectrum-hit" cx={cx} cy={clamp(point.flux_ujy)} r={series.length > 1 ? 6 : 10} tabIndex="0"
              onPointerEnter={() => onSelect(index)} onFocus={() => onSelect(index)} />
          </g>
        })}
        {line.length > 1 && <path className={`spectrum-trend${uncertain ? ' is-uncertain' : ''}`}
          d={line.map(({ wave, flux }, index) => `${index ? 'L' : 'M'}${x(wave).toFixed(1)} ${clamp(flux).toFixed(1)}`).join('')} />}
      </g>
    })}
  </svg>
}

const ALL_DETECTORS = [1, 2, 3, 4, 5, 6]

// Inspector tab. `image` is the loaded image's metadata: its sky position and
// detector are what gets measured. Nothing is requested until the button is pressed.
export default function SpectrumPanel({ spectrum, image }) {
  const { t, date } = useTranslation()
  const [selected, setSelected] = useState(null)
  const [every, setEvery] = useState(false)
  const available = image?.detector && image.requested ? image : null
  const { target, series: loaded } = spectrum
  const loading = spectrum.status === 'loading'
  const wanted = every ? ALL_DETECTORS : available ? [available.detector] : []
  // The chart on screen may belong to a point that is no longer the loaded image.
  const elsewhere = Boolean(target && available
    && (available.requested.ra_deg !== target.ra || available.requested.dec_deg !== target.dec))
  const shown = (elsewhere || !available ? ALL_DETECTORS : wanted)
    .filter((detector) => loaded[detector]?.status === 'ready' && loaded[detector].data.points.length)
    .map((detector) => ({ detector, points: loaded[detector].data.points }))
  const missing = wanted.filter((detector) => loaded[detector]?.status !== 'ready')
  const failed = ALL_DETECTORS.filter((detector) => loaded[detector]?.status === 'error')
  // Detectors of the running request that have already answered.
  const finished = spectrum.queue.filter((detector) => ['ready', 'error'].includes(loaded[detector]?.status)).length
  const points = shown.flatMap((entry) => entry.points)
  const point = selected != null ? points[selected] : null
  const fixed = (value, digits) => value.toFixed(digits)
  const total = (field) => String(shown.reduce((sum, entry) => sum + loaded[entry.detector].data.exposures[field], 0))
  const generate = () => {
    setSelected(null)
    spectrum.request(available.requested.ra_deg, available.requested.dec_deg, wanted)
  }

  return <PanelContent title={t('spectrum.title')}
    footer={available && <div className="spectrum-controls">
      <label className="spectrum-every">
        <input type="checkbox" checked={every} disabled={loading} onChange={(event) => { setSelected(null); setEvery(event.target.checked) }} />
        <span>{t('spectrum.every')}</span>
      </label>
      {loading ? <button type="button" onClick={spectrum.cancel}>{t('spectrum.cancel')}</button>
        : (elsewhere || missing.length > 0) && <button type="button" onClick={generate}>
          {every ? t('spectrum.generateEvery') : t('spectrum.generate', { detector: String(available.detector) })}
        </button>}
    </div>}>
    <section className="inspector-section spectrum-panel" aria-label={t('spectrum.title')}>
      {spectrum.status === 'idle' && <p>{t('spectrum.intro')}</p>}
      {target && <p className="context-note">{t('spectrum.target', { ra: fixed(target.ra, 5), dec: fixed(target.dec, 5) })}</p>}
      {elsewhere && !loading && <p className="spectrum-warning">{t('spectrum.stale')}</p>}
      {loading && <p role="status">{t('spectrum.progress', { done: String(finished), total: String(spectrum.queue.length) })}</p>}
      {!loading && failed.length > 0 && <p role="alert">{t('spectrum.failed', { detectors: failed.map((detector) => `D${detector}`).join(', ') })} {t(loaded[failed[0]].error)}</p>}
      {shown.length > 0 && <>
        <p className="context-note">{t('spectrum.counts', { found: total('found'), measured: total('measured'), skipped: total('skipped'), failed: total('failed') })}</p>
        <Chart series={shown} selected={selected} onSelect={setSelected} />
        <ul className="spectrum-legend">
          {shown.map((entry) => <li key={entry.detector} className={`spectrum-detector-${entry.detector}`}>
            <span className="spectrum-swatch is-trend" />{t('spectrum.detectorTrend', { detector: String(entry.detector) })}</li>)}
          <li><span className="spectrum-swatch" />{t('spectrum.clean')}</li>
          <li><span className="spectrum-swatch is-doubtful" />{t('spectrum.doubtful')}</li>
          <li><span className="spectrum-swatch is-error" />{t('spectrum.errorBar')}</li>
        </ul>
        {shown.some((entry) => entry.points.filter((item) => !doubtful(item)).length < 3) && <p className="spectrum-warning">{t('spectrum.allDoubtful')}</p>}
        <p className="spectrum-readout" role="status">
          {point ? t('spectrum.readout', {
            detector: String(point.detector), wavelength: fixed(point.wavelength_um, 4), flux: fixed(point.flux_ujy, 1),
            error: point.flux_error_ujy == null ? '—' : fixed(point.flux_error_ujy, 1),
            date: date(point.observed_utc, { dateStyle: 'medium', timeZone: 'UTC' }),
            notes: [...point.flags, ...(point.bad_pixels > 0 ? [t('spectrum.badPixels', { count: point.bad_pixels })] : []),
              ...(point.crowded ? [t('spectrum.crowded')] : [])].join(', ') || t('spectrum.noNotes'),
          }) : t('spectrum.hint')}
        </p>
      </>}
      {!loading && spectrum.status === 'ready' && shown.length === 0 && failed.length === 0 && missing.length === 0 && <p role="status">{t('spectrum.empty')}</p>}
    </section>
  </PanelContent>
}
