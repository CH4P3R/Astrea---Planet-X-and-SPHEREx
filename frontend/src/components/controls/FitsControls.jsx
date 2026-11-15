import { useId, useState } from 'react'
import Tooltip from '../common/Tooltip.jsx'
import PanelContent from '../common/PanelContent.jsx'
import InputField from '../common/InputField.jsx'
import { coordinateError, cutoutSizeError } from '../../config/search.js'

export default function FitsControls({ fits, observer }) {
  const formId = useId()
  const [ra, setRa] = useState('')
  const [dec, setDec] = useState('')
  const [validation, setValidation] = useState('')
  const busy = fits.status === 'searching' || fits.status === 'loading'
  const hasResults = fits.images.length > 0
  const sizeError = cutoutSizeError(fits.size)
  const projectionReason = !observer
    ? 'Para colocar esta imagen en el cielo, define latitud y longitud en Ubicación.' : ''

  function submit(event) {
    event.preventDefault()
    if (sizeError || busy) return
    const error = !ra.trim() || !dec.trim() ? 'Introduce RA y Dec en grados decimales.'
      : coordinateError(Number(ra), Number(dec))
    setValidation(error)
    if (!error) fits.searchByCoordinates(Number(ra), Number(dec))
  }

  function edit(setValue, value) {
    setValue(value)
    setValidation('')
    fits.beginPreparation()
  }

  return <PanelContent title="Preparación"
    header={<>
      <InputField label="Tamaño del recorte (minutos de arco)" type="number" min="0.1" max="30" step="0.1"
        value={fits.size}
        help="Cuánto cielo cubre cada lado de la imagen. Se aplica al editarlo, tanto al clic en el cielo como a RA/Dec. Un valor mayor suele generar una matriz con más píxeles."
        onChange={(event) => fits.setSize(event.target.value === '' ? '' : Number(event.target.value))} />
      {busy ? <p role="status">{fits.status === 'searching' ? 'Buscando observaciones…' : 'Cargando imagen…'}</p>
        : !hasResults && <p>Pulsa un punto del cielo o busca por coordenadas.</p>}
    </>}
    footer={<>
      {fits.active && <p className="context-note" role="status">
        {fits.active.metadata.image.width} × {fits.active.metadata.image.height} px
        {' · '}{fits.active.metadata.image.unit ?? 'Sin unidad'}
      </p>}
      {!busy && <Tooltip message={sizeError} tone="error">
        <button type="submit" form={formId} aria-disabled={Boolean(sizeError)}
          onClick={(event) => { if (sizeError) event.preventDefault() }}>Buscar coordenadas</button>
      </Tooltip>}
      {busy ? <button type="button" onClick={fits.reset}>Cancelar operación</button>
        : fits.preparing ? <button type="button" onClick={() => { fits.cancelPreparation(); setValidation('') }}>
          Cancelar preparación
        </button>
          : (fits.status !== 'idle' || fits.active || hasResults) && <button type="button" onClick={fits.reset}>
            Limpiar imagen y resultados
          </button>}
    </>}>
    <form id={formId} onSubmit={submit}>
      <InputField label="Ascensión recta, RA (°)" name="ra" type="number" min="0" max="360" step="any" required
        value={ra} disabled={busy} placeholder="0 a menos de 360"
        help="La posición este/oeste del punto en el cielo, en el sistema ICRS. Introduce grados decimales desde 0 hasta menos de 360, no horas; por ejemplo, 83,63."
        onChange={(event) => edit(setRa, event.target.value)} />
      <InputField label="Declinación, Dec (°)" name="dec" type="number" min="-90" max="90" step="any" required
        value={dec} disabled={busy} placeholder="−90 a 90"
        help="La posición al norte o al sur del ecuador celeste, en el sistema ICRS. Introduce grados decimales entre −90 y 90; por ejemplo, −5,39. No es tu latitud terrestre."
        onChange={(event) => edit(setDec, event.target.value)} />
      {validation && <p role="alert">{validation}</p>}
    </form>
    {fits.error && <p role="alert">{fits.error}</p>}
    {!busy && !fits.preparing && fits.status === 'results' && !hasResults && <p role="status">No hay observaciones en esta región.</p>}
    {!busy && !fits.preparing && hasResults && <>
      {!fits.active && <p>Selecciona una observación para cargar su imagen.</p>}
      <ul className="fits-results">
        {fits.images.map((image) => <li key={image.id}>
          <Tooltip message={projectionReason} tone="error">
            <button type="button" aria-disabled={Boolean(projectionReason)}
              onClick={() => { if (!projectionReason) fits.load(image.id) }}>
              {image.observation_id || image.id.slice(0, 12)} · Detector {image.detector ?? '—'} · {image.collection}
              <br />{image.observation?.start_utc ?? 'Fecha de observación no disponible'}
            </button>
          </Tooltip>
        </li>)}
      </ul>
      {fits.hasMore && <p>Se muestran las primeras 20 observaciones.</p>}
    </>}
  </PanelContent>
}
