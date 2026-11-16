import { Canvas } from '@react-three/fiber'
import { useCallback, useState } from 'react'
import SkyScene from '../../three/core/SkyScene.jsx'
import useObserver from '../../hooks/useObserver.js'
import ContextToolbar from '../controls/ContextToolbar.jsx'
import useSkyClock from '../../hooks/useSkyClock.js'
import useFitsImage from '../../hooks/useFitsImage.js'
import useContextMenu from '../../hooks/useContextMenu.js'
import Tooltip from '../common/Tooltip.jsx'
import StatusNotice from '../common/StatusNotice.jsx'
import { cutoutSizeError } from '../../config/search.js'
import useStars from '../../hooks/useStars.js'
import useTranslation from '../../i18n/useTranslation.js'
import LanguageSelect from '../controls/LanguageSelect.jsx'

export default function AppViewport() {
  const { t } = useTranslation()
  const location = useObserver()
  const clock = useSkyClock()
  const fits = useFitsImage(location.observer, clock.context)
  const stars = useStars(location.observer, clock.context, clock.timestamp)
  const [surfaceVisible, setSurfaceVisible] = useState(true)
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
    ? locating ? 'location.notices.locating'
      : location.error || 'location.notices.required'
    : notice?.reason === 'size' ? cutoutSizeError(size) : ''

  return (
    <main className="app-viewport" aria-label={t('common.viewport')}>
      <div className="scene-layer" aria-label={t('common.scene')}>
        <Canvas orthographic camera={{ position: [0, 0, 0], near: 0.01, far: 250 }}>
          <SkyScene observer={observer} fits={fits} stars={stars} surfaceVisible={surfaceVisible}
            timestamp={clock.timestamp} onSkyClick={onSkyClick} />
        </Canvas>
      </div>
      <div className="ui-layer">
        <ContextToolbar clock={clock} location={location} fits={fits} menu={menu}
          stars={stars} surfaceVisible={surfaceVisible} setSurfaceVisible={setSurfaceVisible} />
        <LanguageSelect />
        <div className="status-region">
          <StatusNotice notice={fits.notice} />
        </div>
        {notice && <Tooltip key={notice.id} point={notice.point} message={t(noticeMessage)} open
          tone={notice.reason === 'location' && locating ? 'info' : 'error'} />}
      </div>
    </main>
  )
}
