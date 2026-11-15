export default function FitsControls({ fits, observer }) {
  const busy = fits.status === 'searching' || fits.status === 'loading'
  return (
    <section className="fits-controls" aria-label="Imágenes SPHEREx">
      <h2>Imágenes SPHEREx</h2>
      <p>Resolución nativa del recorte</p>
      {!observer && <p>Define tu ubicación para buscar imágenes sobre el cielo.</p>}
      <label htmlFor="cutout-size">Lado del recorte (minutos de arco)</label>
      <input id="cutout-size" type="number" min="0.1" max="30" step="0.1" value={fits.size}
        onChange={(event) => fits.setSize(event.target.value === '' ? '' : Number(event.target.value))} />
      <button type="button" disabled={!observer || busy || !(fits.size > 0 && fits.size <= 30)}
        onClick={() => fits.setArmed(!fits.armed)}>
        {fits.armed ? 'Cancelar selección' : 'Seleccionar región del cielo'}
      </button>
      {fits.armed && <p role="status">Haz clic sin arrastrar sobre el punto que deseas consultar.</p>}
      {busy && <p role="status">{fits.status === 'searching' ? 'Buscando observaciones…' : 'Cargando recorte nativo…'}</p>}
      {fits.error && <p role="alert">{fits.error}</p>}
      {fits.status === 'results' && !fits.images.length && <p role="status">No hay observaciones en esta región.</p>}
      {fits.images.length > 0 && <ul className="fits-results">
        {fits.images.map((image) => <li key={image.id}>
          <button type="button" disabled={busy || !observer} onClick={() => fits.load(image.id)}>
            {image.observation_id || image.id.slice(0, 12)} · Detector {image.detector ?? '—'} · {image.collection}
            <br />{image.observation?.start_utc ?? 'Fecha de observación no disponible'}
          </button>
        </li>)}
      </ul>}
      {fits.hasMore && <p>Hay más observaciones antiguas. Se muestran las primeras 20.</p>}
      {fits.active && <p role="status">{fits.active.metadata.image.width} × {fits.active.metadata.image.height} px
        {' · '}{fits.active.metadata.image.unit ?? 'Sin unidad'} · Contraste automático</p>}
      {(fits.active || fits.images.length > 0) && <button type="button" onClick={fits.reset}>Limpiar imagen y resultados</button>}
    </section>
  )
}
