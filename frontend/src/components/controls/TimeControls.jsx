import { useId, useState } from 'react'
import PanelContent from '../common/PanelContent.jsx'
import InputField from '../common/InputField.jsx'

export default function TimeControls({ clock }) {
  const [error, setError] = useState('')
  const formId = useId()
  function submit(event) {
    event.preventDefault()
    const value = new FormData(event.currentTarget).get('utc')
    const timestamp = Date.parse(`${value}Z`)
    if (!Number.isFinite(timestamp)) {
      setError('Introduce una fecha y hora UTC válidas.')
      return
    }
    setError('')
    clock.apply(timestamp)
  }
  return <PanelContent title="Tiempo" header={<p>{clock.paused ? 'Tiempo pausado' : 'En vivo'}</p>}
    footer={<>
      <button type="button" onClick={clock.paused ? clock.goLive : clock.pause}>
        {clock.paused ? 'Volver al tiempo actual' : 'Pausar tiempo'}
      </button>
      <button type="submit" form={formId}>Aplicar fecha</button>
    </>}>
    <form id={formId} onSubmit={submit}>
      <InputField label="Fecha y hora UTC" type="datetime-local" name="utc" required step="1"
        help="El instante que quieres ver en el cielo. Se interpreta en UTC, la hora de referencia mundial, no en la hora local de tu dispositivo." />
      {error && <p role="alert">{error}</p>}
    </form>
    <p className="context-note">{new Date(clock.timestamp).toISOString()} · UTC</p>
    <p className="context-note">La hora del cielo no es la fecha de adquisición de una imagen.</p>
  </PanelContent>
}
