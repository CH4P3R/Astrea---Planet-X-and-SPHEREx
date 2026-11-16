import { useState } from 'react'
import useTranslation from '../../i18n/useTranslation.js'

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

function Chart({ points, selected, onSelect }) {
  const { t } = useTranslation()
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
  const { line, uncertain } = trend(points)

  return <svg className="spectrum-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={t('search.spectrum.chart')}>
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
      {t('search.spectrum.wavelengthAxis')}
    </text>
    <text className="spectrum-axis" transform={`translate(14 ${(PLOT.top + HEIGHT - PLOT.bottom) / 2}) rotate(-90)`} textAnchor="middle">
      {t('search.spectrum.fluxAxis')}
    </text>
    {line.length > 1 && <path className={`spectrum-trend${uncertain ? ' is-uncertain' : ''}`}
      d={line.map(({ wave, flux }, index) => `${index ? 'L' : 'M'}${x(wave).toFixed(1)} ${clamp(flux).toFixed(1)}`).join('')} />}
    {points.map((point, index) => {
      const cx = x(point.wavelength_um)
      const error = point.flux_error_ujy ?? 0
      const outside = point.flux_ujy < yMin || point.flux_ujy > yMax
      return <g key={point.source_url} className={`spectrum-point${doubtful(point) ? ' is-doubtful' : ''}${selected === index ? ' is-selected' : ''}`}>
        {error > 0 && <line className="spectrum-error" x1={cx} x2={cx} y1={clamp(point.flux_ujy - error)} y2={clamp(point.flux_ujy + error)} />}
        {/* A point beyond the vertical range sits on the edge as a triangle. */}
        {outside
          ? <path className="spectrum-mark" d={point.flux_ujy > yMax
            ? `M${cx - 5} ${PLOT.top + 8}L${cx + 5} ${PLOT.top + 8}L${cx} ${PLOT.top}Z`
            : `M${cx - 5} ${HEIGHT - PLOT.bottom - 8}L${cx + 5} ${HEIGHT - PLOT.bottom - 8}L${cx} ${HEIGHT - PLOT.bottom}Z`} />
          : <circle className="spectrum-mark" cx={cx} cy={y(point.flux_ujy)} r="3.5" />}
        <circle className="spectrum-hit" cx={cx} cy={clamp(point.flux_ujy)} r="10" tabIndex="0"
          onPointerEnter={() => onSelect(index)} onFocus={() => onSelect(index)} />
      </g>
    })}
  </svg>
}

export default function SpectrumPanel({ spectrum }) {
  const { t, date } = useTranslation()
  const [selected, setSelected] = useState(null)
  if (spectrum.status === 'idle') return null
  const { target, data } = spectrum
  const points = data?.points ?? []
  const point = selected != null ? points[selected] : null
  const fixed = (value, digits) => value.toFixed(digits)

  return <section className="spectrum-panel" aria-label={t('search.spectrum.title')}>
    <header>
      <div>
        <h2>{t('search.spectrum.title')}</h2>
        <p>{t('search.spectrum.target', { detector: String(target.detector), ra: fixed(target.ra, 5), dec: fixed(target.dec, 5) })}</p>
      </div>
      <button type="button" onClick={spectrum.close}>{t('search.spectrum.close')}</button>
    </header>
    {spectrum.status === 'loading' && <p role="status">{t('search.spectrum.loading')}</p>}
    {spectrum.status === 'error' && <p role="alert">{t(spectrum.error)}</p>}
    {spectrum.status === 'ready' && <>
      <p className="spectrum-counts">{t('search.spectrum.counts', { found: String(data.exposures.found),
        measured: String(data.exposures.measured), skipped: String(data.exposures.skipped), failed: String(data.exposures.failed) })}</p>
      {points.length === 0 ? <p role="status">{t('search.spectrum.empty')}</p> : <>
        <Chart points={points} selected={selected} onSelect={setSelected} />
        <ul className="spectrum-legend">
          <li><span className="spectrum-swatch is-trend" />{t('search.spectrum.trend')}</li>
          <li><span className="spectrum-swatch" />{t('search.spectrum.clean')}</li>
          <li><span className="spectrum-swatch is-doubtful" />{t('search.spectrum.doubtful')}</li>
        </ul>
        {points.filter((item) => !doubtful(item)).length < 3 && <p className="spectrum-warning">{t('search.spectrum.allDoubtful')}</p>}
        <p className="spectrum-readout" role="status">
          {point ? t('search.spectrum.readout', {
            wavelength: fixed(point.wavelength_um, 4), flux: fixed(point.flux_ujy, 1),
            error: point.flux_error_ujy == null ? '—' : fixed(point.flux_error_ujy, 1),
            date: date(point.observed_utc, { dateStyle: 'medium', timeZone: 'UTC' }),
            notes: [...point.flags, ...(point.bad_pixels > 0 ? [t('search.spectrum.badPixels', { count: point.bad_pixels })] : []),
              ...(point.crowded ? [t('search.spectrum.crowded')] : [])].join(', ') || t('search.spectrum.noNotes'),
          }) : t('search.spectrum.hint')}
        </p>
      </>}
    </>}
  </section>
}
