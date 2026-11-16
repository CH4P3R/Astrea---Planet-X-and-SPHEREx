// Deterministic visual samples using the real inspector and star renderer.
// Open /tests/inspector-visual.html through Vite. No archive/API requests.
import { useLayoutEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useThree } from '@react-three/fiber'
import ImageInspector from '../src/components/layout/ImageInspector.jsx'
import Stars from '../src/three/elements/Stars.jsx'
import { baseOrthographicZoom } from '../src/three/core/skyViewUtils.js'
import { SKY } from '../src/config/sky.js'
import I18nProvider from '../src/i18n/I18nProvider.jsx'
import useTranslation from '../src/i18n/useTranslation.js'
import '../src/styles/main.css'

const noop = () => {}
const timestamp = Date.parse('2026-07-13T09:00:00Z')
const magnitudes = [-1, 0, 2, 4, 7]
const colors = ['#a8c5ff', '#fff5e7', '#ffb16b']
const baseMetadata = {
  id: 'visual-fixture-a', collection: 'spherex_fixture', detector: 1,
  observation_id: 'deterministic-preview-2026-07-13',
  observation: { start_utc: '2026-07-13T09:00:00Z' },
  requested: { ra_deg: 210.80227, dec_deg: 54.34895, size_deg: 0.1, frame: 'icrs' },
  image: { width: 512, height: 512, nonfinite_count: 128, unit: 'MJy/sr', dtype: 'float32',
    finite_min: -0.024, finite_max: 16.832, center: { ra_deg: 210.8023, dec_deg: 54.3489 } },
  source_url: 'https://irsa.ipac.caltech.edu/',
}

function StarSamples({ zoom }) {
  const { get, size } = useThree()
  const cameraZoom = baseOrthographicZoom(size.width, size.height) * zoom
  useLayoutEffect(() => {
    const { camera } = get()
    camera.zoom = cameraZoom
    camera.updateProjectionMatrix()
  }, [get, cameraZoom])
  const snapshot = useMemo(() => {
    const stars = []
    const directions = []
    colors.forEach((color, row) => magnitudes.forEach((magnitude, column) => {
      // Keep samples in the same screen cells while the real camera zoom grows.
      // This isolates point diameter from the ordinary movement of sky positions.
      const x = ((column + 0.5) / magnitudes.length - 0.5) * size.width / cameraZoom
      const y = (0.5 - (row + 0.5) / colors.length) * size.height / cameraZoom
      const z = -Math.sqrt(SKY.radius ** 2 - x ** 2 - y ** 2)
      stars.push({ apparent_magnitude: magnitude, color_hex: color })
      directions.push(x / SKY.radius, y / SKY.radius, z / SKY.radius)
    }))
    return { coordinate_frame: 'AltAz', mode: 'paused', star_count: stars.length, stars,
      sample_times_ms: [timestamp], directions: [new Float32Array(directions)] }
  }, [cameraZoom, size.width, size.height])
  return <Stars snapshot={snapshot} timestamp={timestamp} />
}

export default function InspectorVisualFixture() {
  const { language, setLanguage } = useTranslation()
  const [width, setWidth] = useState(480)
  const [height, setHeight] = useState(780)
  const [zoom, setZoom] = useState(1)
  const [tab, setTab] = useState('data')
  const [detector, setDetector] = useState(1)
  const [centered, setCentered] = useState(false)
  const [settings, setSettings] = useState({ palette: 'gray', exposure: 0, opacity: 1 })
  const [processing, setProcessing] = useState({ mask_flags: false, subtract_zodi: false, signal_to_noise: false })
  const image = { metadata: { ...baseMetadata, detector } }
  const frames = [{ id: image.metadata.id, label: 'A', reference: true, image }]
  const comparison = { observations: [], status: 'results', year: 2026, searchedYear: 2026,
    sameDetector: true, candidates: [], dirty: false, hasMore: false, error: null,
    setYear: noop, setSameDetector: noop, cancel: noop, retry: noop, remove: noop, clear: noop, load: noop }
  const appearance = { settings, processing, appliedProcessing: processing, ready: true, hasData: true,
    loading: false, error: null, retry: noop, restore: () => setSettings({ palette: 'gray', exposure: 0, opacity: 1 }),
    change: (key, value) => setSettings((current) => ({ ...current, [key]: value })),
    process: (key, value) => setProcessing((current) => ({ ...current, [key]: value })) }
  return <main className="visual-fixture">
    <h1>Inspector and stars — visual preview</h1>
    <p>Real components with local sample data. Detector selection and tabs are interactive; no IRSA requests.
      Star positions stay in fixed cells to compare diameter and edges as camera zoom changes.</p>
    <div className="visual-controls" aria-label="Visual preview controls">
      <button type="button" onClick={() => setWidth((value) => value === 480 ? 350 : 480)}>Panel: {width}px</button>
      <button type="button" onClick={() => setHeight((value) => value === 780 ? 480 : 780)}>Height: {height}px</button>
      {[1, 4, 16].map((value) => <button key={value} type="button" aria-pressed={zoom === value}
        onClick={() => setZoom(value)}>Zoom {value}×</button>)}
      <button type="button" onClick={() => setLanguage(language === 'en' ? 'es' : 'en')}>Language: {language}</button>
    </div>
    <div className="visual-preview">
      <section className="visual-stars" aria-label="Star rendering samples">
        <h2>Color, magnitude and zoom</h2>
        <p>Rows: blue, warm white, orange. Columns: apparent magnitudes −1, 0, 2, 4, 7.</p>
        <div className="visual-star-canvas">
          <Canvas orthographic camera={{ position: [0, 0, 0], near: 0.1, far: 200, zoom: 1 }}
            gl={{ antialias: true }} dpr={[1, 2]}>
            <color attach="background" args={['#060c18']} />
            <StarSamples zoom={zoom} />
          </Canvas>
        </div>
        <div className="visual-star-magnitudes">{magnitudes.map((value) => <span key={value}>Mag {value}</span>)}</div>
        <p className="visual-state" role="status">Zoom {zoom}× · selected detector D{detector}{centered ? ' · center action received' : ''}</p>
      </section>
      <div className="inspector-preview" style={{ width, height }}>
        <ImageInspector open onClose={noop} tab={tab} onTabChange={setTab}
          fits={{ active: image, status: 'ready', images: [], setDetector, cancel: noop }}
          displayed={image} appearance={appearance} comparison={comparison}
          playback={{ frameId: image.metadata.id, frame: 'A', playing: false, seconds: 0.5, pause: noop, show: noop }}
          reason="" primaryProjection={{ ready: true }} frames={frames}
          projections={{ byId: { [image.metadata.id]: { ready: true } }, retry: noop }}
          onCenter={() => setCentered(true)} />
      </div>
    </div>
  </main>
}

createRoot(document.getElementById('root')).render(<I18nProvider><InspectorVisualFixture /></I18nProvider>)
