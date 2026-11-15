import { Canvas } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import ImageInspector from './ImageInspector.jsx'
import useImageViewport from '../../hooks/useImageViewport.js'
import useImageComparison from '../../hooks/useImageComparison.js'
import useProjectedImage from '../../hooks/useProjectedImage.js'
import useImageAppearance from '../../hooks/useImageAppearance.js'
import useBlinkPlayback from '../../hooks/useBlinkPlayback.js'
import { compatibleUnits } from '../../config/appearance.js'

export default function AppViewport() {
  const { t, language } = useTranslation()
  const rootRef = useRef(null)
  const location = useObserver()
  const clock = useSkyClock()
  const fits = useFitsImage(location.observer, clock.context)
  const stars = useStars(location.observer, clock.context, clock.timestamp)
  const [surfaceVisible, setSurfaceVisible] = useState(true)
  const [notice, setNotice] = useState(null)
  const [tab, setTab] = useState('data')
  const [dismissedId, setDismissedId] = useState(null)
  const [focusVersion, setFocusVersion] = useState(0)
  const activeId = fits.active?.metadata.id
  const inspectorOpen = Boolean(activeId && dismissedId !== activeId)
  const searchPending = fits.preparing || (!fits.active && ['searching', 'loading', 'results', 'error'].includes(fits.status))
  const menu = useContextMenu({ persistentIds: [
    ...(searchPending ? ['search'] : []),
    ...(location.status === 'loading' ? ['location'] : []),
  ] })
  const { observer } = location
  const comparison = useImageComparison(fits.active, inspectorOpen && tab === 'compare', observer, clock.context, fits.textureLimit)
  const primaryProjection = useProjectedImage(fits.active, observer, clock.context, clock.timestamp)
  const secondaryProjection = useProjectedImage(comparison.partner, observer, clock.context, clock.timestamp)
  const unitsMatch = compatibleUnits(fits.active, comparison.partner)
  const appearance = useImageAppearance(fits.active, unitsMatch ? comparison.partner : null)
  const reason = !comparison.partner ? 'inspector.compare.needPartner'
    : !unitsMatch ? 'inspector.compare.units'
      : ['searching', 'loading'].includes(fits.status) || ['searching', 'loading'].includes(comparison.status) ? 'inspector.compare.busy'
        : !primaryProjection.ready || !secondaryProjection.ready ? 'inspector.compare.position'
          : !appearance.ready ? 'inspector.compare.processing'
            : !appearance.hasData ? 'inspector.compare.noData' : ''
  const playback = useBlinkPlayback(`${activeId}:${comparison.partner?.metadata.id}`, !reason)
  const displayed = playback.frame === 'B' && comparison.partner ? comparison.partner : fits.active
  const viewport = useImageViewport(rootRef, `${inspectorOpen}:${menu.active}:${language}:${activeId}:${fits.notice?.status}:${tab}`)
  const frameImages = useMemo(() => [primaryProjection.ready ? primaryProjection.image : null,
    unitsMatch && secondaryProjection.ready ? secondaryProjection.image : null].filter(Boolean),
  [primaryProjection.image, primaryProjection.ready, secondaryProjection.image, secondaryProjection.ready, unitsMatch])
  const { size, search } = fits
  const { open } = menu
  useEffect(() => { if (activeId) open(null) }, [activeId, open])
  const onSkyClick = useCallback((direction, point) => {
    if (activeId) return
    const reason = !observer ? 'location' : cutoutSizeError(size) ? 'size' : null
    if (reason) {
      setNotice((previous) => ({ id: (previous?.id ?? 0) + 1, point, reason }))
      return
    }
    setNotice(null)
    open('search')
    search(direction)
  }, [observer, size, search, open, activeId])
  const locating = location.status === 'loading'
  const noticeMessage = notice?.reason === 'location' && !observer
    ? locating ? 'location.notices.locating'
      : location.error || 'location.notices.required'
    : notice?.reason === 'size' ? cutoutSizeError(size) : ''

  return (
    <main ref={rootRef} className="app-viewport" data-inspector-open={inspectorOpen} aria-label={t('common.viewport')}>
      <div className="scene-layer" aria-label={t('common.scene')}>
        <Canvas orthographic camera={{ position: [0, 0, 0], near: 0.01, far: 250 }}>
          <SkyScene observer={observer} fits={fits} stars={stars} surfaceVisible={surfaceVisible}
            timestamp={clock.timestamp} onSkyClick={onSkyClick} frameImages={frameImages} viewport={viewport} focusVersion={focusVersion}
            primary={primaryProjection} secondary={secondaryProjection} appearance={appearance} frame={playback.frame} />
        </Canvas>
      </div>
      <div className="ui-layer">
        <ContextToolbar clock={clock} location={location} fits={fits} menu={menu}
          stars={stars} surfaceVisible={surfaceVisible} setSurfaceVisible={setSurfaceVisible} />
        <LanguageSelect />
        <ImageInspector open={inspectorOpen} tab={tab} fits={fits} displayed={displayed} appearance={appearance}
          comparison={comparison} playback={playback} reason={t(reason)} primaryProjection={primaryProjection} secondaryProjection={secondaryProjection}
          onTabChange={(value) => { playback.pause(); setTab(value) }}
          onClose={() => { playback.pause(); setDismissedId(activeId) }}
          onOpen={() => { setDismissedId(null); setFocusVersion((value) => value + 1) }}
          onCenter={() => setFocusVersion((value) => value + 1)}
          onNewRegion={() => { playback.show('A'); fits.reset(); setTab('data'); setDismissedId(null); open('search') }} />
        <div className="status-region">
          <StatusNotice notice={fits.notice} />
        </div>
        {notice && <Tooltip key={notice.id} point={notice.point} message={t(noticeMessage)} open
          tone={notice.reason === 'location' && locating ? 'info' : 'error'} />}
      </div>
    </main>
  )
}
