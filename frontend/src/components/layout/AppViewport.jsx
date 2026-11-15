import { Canvas } from '@react-three/fiber'
import { useCallback, useState } from 'react'
import SkyScene from '../../three/core/SkyScene.jsx'
import useObserver from '../../hooks/useObserver.js'
import ContextToolbar from '../controls/ContextToolbar.jsx'
import useSkyClock from '../../hooks/useSkyClock.js'
import useFitsImage from '../../hooks/useFitsImage.js'
import useContextMenu from '../../hooks/useContextMenu.js'
import Tooltip from '../common/Tooltip.jsx'
import { cutoutSizeError } from '../../config/search.js'

export default function AppViewport() {
  const location = useObserver()
  const clock = useSkyClock()
  const fits = useFitsImage(location.observer, clock.context)
  const [notice, setNotice] = useState(null)
  const searchPending = fits.preparing || ['searching', 'loading', 'results', 'error'].includes(fits.status)
  const menu = useContextMenu({ persistentIds: [
    ...(searchPending ? ['search'] : []),
    ...(location.status === 'loading' ? ['location'] : []),
  ] })
  const { observer } = location
  const { size, search } = fits
  const { open } = menu
  const onSkyClick = useCallback((direction, point) => {
    const reason = !observer ? 'location' : cutoutSizeError(size) ? 'size' : null
    if (reason) {
      setNotice((previous) => ({ id: (previous?.id ?? 0) + 1, point, reason }))
      return
    }
    setNotice(null)
    open('search')
    search(direction)
  }, [observer, size, search, open])
  const locating = location.status === 'loading'
  const noticeMessage = notice?.reason === 'location' && !observer
    ? locating ? 'Obteniendo tu ubicación. Cuando termine, vuelve a pulsar el punto del cielo.'
      : location.error || 'Define latitud y longitud en Ubicación para buscar al pulsar el cielo.'
    : notice?.reason === 'size' ? cutoutSizeError(size) : ''

  return (
    <main className="app-viewport" aria-label="Bóveda celeste tridimensional">
      <div className="scene-layer" aria-label="Esfera celeste y direcciones del horizonte local">
        <Canvas orthographic camera={{ position: [0, 0, 0], near: 0.01, far: 250 }}>
          <SkyScene observer={observer} fits={fits} timestamp={clock.timestamp} onSkyClick={onSkyClick} />
        </Canvas>
      </div>
      <div className="ui-layer">
        <ContextToolbar clock={clock} location={location} fits={fits} menu={menu} />
        {notice && <Tooltip key={notice.id} point={notice.point} message={noticeMessage} open
          tone={notice.reason === 'location' && locating ? 'info' : 'error'} />}
      </div>
    </main>
  )
}
