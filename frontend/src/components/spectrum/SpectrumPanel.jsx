import { useEffect, useState } from 'react'
import PanelContent from '../common/PanelContent.jsx'
import { DETECTORS } from '../../config/search.js'
import { onboardingSpectrumPosition } from '../../services/onboardingSpectrum.js'
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
  if (!(reach > 0)) return { line: [], uncertain }
  const first = clean[0].wavelength_um
  const last = clean.at(-1).wavelength_um
  const line = Array.from({ length: samples }, (_, index) => {
    const wave = first + (last - first) * index / (samples - 1)
    let total = 0
    let flux = 0
    for (const point of clean) {
      const distance = (point.wavelength_um - wave) / reach
      // Do not invent a trend through an unobserved stretch of the spectrum.
      // Three Gaussian widths retain the local guide and leave larger gaps.
      if (Math.abs(distance) > 3) continue
      const weight = Math.exp(-0.5 * distance ** 2) / point.flux_error_ujy ** 2
      total += weight
      flux += weight * point.flux_ujy
    }
    const average = flux / total
    return total > 0 && Number.isFinite(average) ? { wave, flux: average } : null
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
          d={line.map((point, index) => point
            ? `${line[index - 1] ? 'L' : 'M'}${x(point.wave).toFixed(1)} ${clamp(point.flux).toFixed(1)}` : '').join('')} />}
      </g>
    })}
  </svg>
}

// The PSF fit comes first; the aperture stays as the fallback.
const METHODS = ['psf', 'aperture']

// Inspector tab. `image` is the loaded image's metadata: its sky position is what
// gets measured. Each detector is measured when the user turns it on, and can be
// hidden and shown again without measuring it twice.
export default function SpectrumPanel({ spectrum, image, sample = false }) {
  const { t, date } = useTranslation()
  const [selected, setSelected] = useState(null)
  const [method, setMethod] = useState('psf')
  const position = sample ? onboardingSpectrumPosition : image?.requested
  const { target, series: loaded, reset } = spectrum
  // Measurements of another sky point or method are discarded: a new choice starts clean.
  const elsewhere = Boolean(target && position
    && (position.ra_deg !== target.ra || position.dec_deg !== target.dec || method !== target.method))
  useEffect(() => { if (elsewhere) reset() }, [elsewhere, reset])
  const entries = elsewhere ? {} : loaded
  const shown = DETECTORS.map(({ value }) => value)
    .filter((detector) => entries[detector]?.visible && entries[detector].data?.points.length)
    .map((detector) => ({ detector, points: entries[detector].data.points }))
  const names = (status, test = () => true) => DETECTORS.map(({ value }) => value)
    .filter((detector) => entries[detector]?.status === status && test(entries[detector])).map((detector) => `D${detector}`).join(', ')
  const measuring = names('loading')
  const failed = names('error')
  const incomplete = names('ready', (entry) => entry.data.exposures.failed > 0)
  const blank = names('ready', (entry) => entry.data.points.length === 0 && !entry.data.exposures.failed)
  const retryable = DETECTORS.map(({ value }) => value).filter((detector) => {
    const entry = entries[detector]
    return entry?.status === 'error' || (entry?.status === 'ready' && entry.data.exposures.failed > 0)
  })
  const points = shown.flatMap((entry) => entry.points)
  const point = selected != null ? points[selected] : null
  const fixed = (value, digits) => value.toFixed(digits)
  const total = (field) => String(shown.reduce((sum, entry) => sum + entries[entry.detector].data.exposures[field], 0))

  return <PanelContent title={t('spectrum.title')}
    footer={position && <div className="spectrum-controls">
      <div className="spectrum-methods" role="group" aria-label={t('spectrum.method.label')}>
        <span>{t('spectrum.method.label')}</span>
        {METHODS.map((name) => <button key={name} type="button" aria-pressed={method === name}
          title={t(`spectrum.method.${name}Help`)} onClick={() => { setSelected(null); setMethod(name) }}>
          {t(`spectrum.method.${name}`)}
        </button>)}
      </div>
      <div className="spectrum-detectors" role="group" aria-label={t('spectrum.choose')}>
      {DETECTORS.map(({ value: detector, range }) => {
        const entry = entries[detector]
        return <button key={detector} type="button" className={`spectrum-detector-${detector}`}
          disabled={sample && detector !== 3}
          aria-pressed={entry?.status === 'loading' || Boolean(entry?.data && entry.visible)}
          aria-busy={entry?.status === 'loading' || undefined}
          title={t('search.fields.detector.option', { detector, range })}
          onClick={() => { setSelected(null); spectrum.toggle(position.ra_deg, position.dec_deg, detector, method) }}>
          <span className="spectrum-chip-dot" />D{detector}{entry?.status === 'loading' ? '…' : ''}
        </button>
      })}
      </div>
    </div>}>
    <section className="inspector-section spectrum-panel" aria-label={t('spectrum.title')}>
      <p>{t(sample ? 'spectrum.tutorialIntro' : 'spectrum.intro')}</p>
      {measuring && <p role="status">{t('spectrum.measuring', { detectors: measuring })}</p>}
      {failed && <p role="alert">{t('spectrum.failed', { detectors: failed })}</p>}
      {incomplete && <p role="status">{t('spectrum.incomplete', { detectors: incomplete })}</p>}
      {position && retryable.length > 0 && <div className="spectrum-retries">
        {retryable.map((detector) => <button key={detector} type="button" onClick={() => {
          setSelected(null)
          spectrum.retry(position.ra_deg, position.dec_deg, detector, method)
        }}>{t('spectrum.retry', { detector })}</button>)}
      </div>}
      {blank && <p role="status">{t('spectrum.empty', { detectors: blank })}</p>}
      {shown.length > 0 && <>
        <p className="context-note">{t('spectrum.target', { ra: fixed(target.ra, 5), dec: fixed(target.dec, 5), method: t(`spectrum.method.${target.method}Note`) })}</p>
        <p className="context-note">{t('spectrum.counts', { found: total('found'), measured: total('measured'), skipped: total('skipped'), failed: total('failed') })}</p>
        <Chart series={shown} selected={selected} onSelect={setSelected} />
        <ul className="spectrum-legend">
          {!sample && shown.map((entry) => <li key={entry.detector} className={`spectrum-detector-${entry.detector}`}>
            <span className="spectrum-swatch is-trend" />{t('spectrum.detectorTrend', { detector: String(entry.detector) })}</li>)}
          <li><span className="spectrum-swatch" />{t('spectrum.clean')}</li>
          <li><span className="spectrum-swatch is-doubtful" />{t('spectrum.doubtful')}</li>
          <li><span className="spectrum-swatch is-error" />{t('spectrum.errorBar')}</li>
        </ul>
        {!sample && shown.some((entry) => entry.points.filter((item) => !doubtful(item)).length < 3) && <p className="spectrum-warning">{t('spectrum.allDoubtful')}</p>}
        <p className="spectrum-readout" role="status">
          {point ? t('spectrum.readout', {
            detector: String(point.detector), wavelength: fixed(point.wavelength_um, 4), flux: fixed(point.flux_ujy, 1),
            error: point.flux_error_ujy == null ? '—' : fixed(point.flux_error_ujy, 1),
            date: date(point.observed_utc, { dateStyle: 'medium', timeZone: 'UTC' }),
            notes: [...point.flags, ...(point.bad_pixels > 0 ? [t('spectrum.badPixels', { count: point.bad_pixels })] : []),
              ...(point.crowded ? [t('spectrum.crowded')] : [])].join(', ') || t('spectrum.noNotes'),
          }) : t(sample ? 'spectrum.tutorialHint' : 'spectrum.hint')}
        </p>
      </>}
    </section>
  </PanelContent>
}
