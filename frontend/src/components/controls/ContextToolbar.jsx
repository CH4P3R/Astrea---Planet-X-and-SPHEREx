import ContextPanel from '../common/ContextPanel.jsx'
import Tooltip from '../common/Tooltip.jsx'
import ContextIcon from './ContextIcons.jsx'
import TimeControls from './TimeControls.jsx'
import LocationControls from './LocationControls.jsx'
import FitsControls from './FitsControls.jsx'
import SkyControls from './SkyControls.jsx'

const options = [
  { id: 'time', label: 'Tiempo' },
  { id: 'location', label: 'Ubicación' },
  { id: 'search', label: 'Preparación' },
  { id: 'sky', label: 'Aspecto del cielo' },
]
export default function ContextToolbar({ clock, location, fits, menu, stars, surfaceVisible, setSurfaceVisible }) {
  const { active, hint, keepOpen, preview, leave } = menu

  return <>
    <div className="sky-clock" aria-label="Hora local del cielo mostrado">
      <time dateTime={new Date(clock.timestamp).toISOString()}>
        <strong>{new Date(clock.timestamp).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</strong>
        <span>{new Date(clock.timestamp).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      </time>
    </div>
    <div className="context-toolbar" onPointerEnter={keepOpen} onPointerLeave={leave}
      onFocus={keepOpen} onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) leave()
      }}>
      <nav className="context-rail" aria-label="Contexto y preparación">
        {options.map(({ id, label }) => <div className="context-tool" key={id}>
          <Tooltip message={label} open={hint === id} compact>
          <button id={`context-trigger-${id}`} type="button" className={`context-trigger${active === id ? ' is-active' : ''}`}
            aria-label={label} aria-expanded={active === id} aria-controls={`context-${id}`}
            onPointerEnter={() => preview(id)}
            onPointerLeave={menu.cancelPreview}
            onFocus={() => preview(id)} onBlur={menu.cancelPreview}
            onClick={() => menu.open(id)}>
            <ContextIcon name={id} />
          </button>
          </Tooltip>
        </div>)}
      </nav>
      <div className="context-panels" onPointerEnter={() => { keepOpen(); menu.cancelPreview() }}>
        {options.map(({ id, label }) => <ContextPanel key={id} id={id} anchorId={`context-trigger-${id}`}
          label={label} visible={active === id}>
          {id === 'time' && <TimeControls clock={clock} />}
          {id === 'location' && <LocationControls {...location} />}
          {id === 'search' && <FitsControls fits={fits} observer={location.observer} />}
          {id === 'sky' && <SkyControls stars={stars} surfaceVisible={surfaceVisible} setSurfaceVisible={setSurfaceVisible} />}
        </ContextPanel>)}
      </div>
    </div>
  </>
}
