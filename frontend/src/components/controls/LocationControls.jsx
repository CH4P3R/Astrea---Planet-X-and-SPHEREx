import { useState } from 'react'

export default function LocationControls({ observer, status, error, locate, applyManualLocation }) {
  const [validation, setValidation] = useState('')

  function submit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const latitude = data.get('latitude').trim()
    const longitude = data.get('longitude').trim()
    if (!latitude || !longitude || !applyManualLocation(Number(latitude), Number(longitude))) {
      setValidation('Introduce latitud de −90° a 90° y longitud de −180° a 180°.')
      return
    }
    setValidation('')
  }

  return (
    <details className="location-control" open={!observer}>
      <summary>
        {observer ? `Ubicación · ${observer.source === 'device' ? 'Dispositivo' : 'Manual'}`
          : status === 'loading' ? 'Obteniendo ubicación…' : 'Ubicación · Opcional'}
      </summary>
      <div className="location-body">
        <p role="status">{observer
          ? `${observer.latitude.toFixed(4)}°, ${observer.longitude.toFixed(4)}°`
          : 'La ubicación es opcional. Sin ella, Norte, Este, Sur y Oeste sirven como referencias de la escena.'}</p>
        <button type="button" onClick={locate} disabled={status === 'loading'}>
          {status === 'loading' ? 'Buscando…' : 'Usar ubicación del dispositivo'}
        </button>
        {error && <p className="location-error" role="alert">{error}</p>}
        <form onSubmit={submit}>
          <fieldset>
            <legend>Ubicación manual</legend>
            <label>Latitud (°)
              <input name="latitude" type="number" min="-90" max="90" step="any" required
                defaultValue={observer?.latitude} placeholder="−90 a 90" />
            </label>
            <label>Longitud (°)
              <input name="longitude" type="number" min="-180" max="180" step="any" required
                defaultValue={observer?.longitude} placeholder="−180 a 180" />
            </label>
          </fieldset>
          {validation && <p className="location-error" role="alert">{validation}</p>}
          <button type="submit">Aplicar ubicación</button>
        </form>
      </div>
    </details>
  )
}
