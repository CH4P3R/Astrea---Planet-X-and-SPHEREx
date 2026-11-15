import PanelContent from '../common/PanelContent.jsx'

export default function SkyControls({ stars, surfaceVisible, setSurfaceVisible }) {
  const status = stars.status === 'idle' ? 'Define tu ubicación para cargar las estrellas.'
    : stars.status === 'loading' ? 'Cargando estrellas de Hipparcos…'
      : stars.snapshot ? `${stars.snapshot.star_count.toLocaleString('es')} estrellas · Hipparcos`
        : 'Estrellas no disponibles.'

  return <PanelContent title="Aspecto del cielo"
    header={<p className="context-note" role="status">{status}</p>}
    footer={stars.status === 'error' && <button type="button" onClick={stars.retry}>Volver a cargar estrellas</button>}>
    <label className="sky-surface-toggle">
      <input type="checkbox" checked={surfaceVisible} onChange={(event) => setSurfaceVisible(event.target.checked)}
        aria-describedby="sky-surface-help" />
      <span>Mostrar superficie central</span>
    </label>
    <p id="sky-surface-help" className="context-note">Cuadrícula horizontal transparente bajo el observador. Se atenúa al mirar hacia abajo y permite explorar el cielo inferior.</p>
    {stars.error && <p role="alert">{stars.error}</p>}
  </PanelContent>
}
