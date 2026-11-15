import { useId, useState } from 'react'
import PanelContent from '../common/PanelContent.jsx'
import InputField from '../common/InputField.jsx'

export default function LocationControls({ observer, status, error, locate, applyManualLocation }) {
  const [validation, setValidation] = useState('')
  const formId = useId()

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

  return <PanelContent title="Ubicación" header={<p role="status">{observer
    ? `${observer.source === 'device' ? 'Dispositivo' : 'Manual'} · ${observer.latitude.toFixed(4)}°, ${observer.longitude.toFixed(4)}°`
    : 'Define desde dónde observas para buscar recortes al pulsar el cielo.'}</p>}
    footer={<>
      <button type="button" onClick={locate} disabled={status === 'loading'}>
        {status === 'loading' ? 'Buscando ubicación…' : 'Usar ubicación del dispositivo'}
      </button>
      <button type="submit" form={formId}>Aplicar ubicación manual</button>
    </>}>
    {error && <p role="alert">{error}</p>}
    <form id={formId} onSubmit={submit}>
      <InputField label="Latitud (°)" name="latitude" type="number" min="-90" max="90" step="any" required
        defaultValue={observer?.latitude} placeholder="−90 a 90"
        help="Tu posición al norte o al sur del ecuador, en grados decimales. Norte es positivo y sur negativo; por ejemplo, 19,43." />
      <InputField label="Longitud (°)" name="longitude" type="number" min="-180" max="180" step="any" required
        defaultValue={observer?.longitude} placeholder="−180 a 180"
        help="Tu posición al este o al oeste del meridiano de Greenwich, en grados decimales. Este es positivo y oeste negativo; por ejemplo, −99,13." />
      {validation && <p role="alert">{validation}</p>}
    </form>
  </PanelContent>
}
