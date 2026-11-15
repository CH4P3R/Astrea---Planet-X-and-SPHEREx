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
import useComparisonPresentation from '../../hooks/useComparisonPresentation.js'
import useProjectedImage from '../../hooks/useProjectedImage.js'

export default function AppViewport() {
  const { t, language } = useTranslation()
  const rootRef = useRef(null)
  const location = useObserver()
  const clock = useSkyClock()
  const fits = useFitsImage(location.observer, clock.context)
  const stars = useStars(location.observer, clock.context, clock.timestamp)
  const starsNotice = useMemo(() => stars.status === 'loading' && !stars.snapshot
    ? { status: 'loading', message: 'sky.status.loadingNotice', icon: 'star' } : null,
  [stars.status, stars.snapshot])
  const [surfaceVisible, setSurfaceVisible] = useState(true)
  const [notice, setNotice] = useState(null)
  const [tab, setTab] = useState('data')
  const [focusVersion, setFocusVersion] = useState(0)
  const [searchDirection, setSearchDirection] = useState(null)
  const activeId = fits.active?.metadata.id
  const inspectorOpen = Boolean(activeId)
  const searchPending = fits.preparing || (!fits.active && ['searching', 'loading', 'results', 'error'].includes(fits.status))
  const menu = useContextMenu({ persistentIds: [
    ...(searchPending ? ['search'] : []),
    ...(location.status === 'loading' ? ['location'] : []),
  ] })
  const { observer } = location
  const comparison = useImageComparison(fits.active, inspectorOpen && tab === 'compare', observer, clock.context, fits.textureLimit)
  const baseProjection = useProjectedImage(fits.active, observer, clock.context, clock.timestamp)
  const detailProjection = useProjectedImage(tab === 'compare' ? null : fits.detail, observer, clock.context, clock.timestamp)
  const primaryImage = detailProjection.ready ? fits.detail : fits.active
  const singleImages = useMemo(() => primaryImage ? [primaryImage] : [], [primaryImage])
  const { frames, projections, primaryProjection, appearance, playback, reason, displayed, frameImages: comparisonFrames, layers }
    = useComparisonPresentation(tab === 'compare' ? comparison : { ...comparison, images: singleImages },
      observer, clock.context, clock.timestamp, fits.status)
  const viewport = useImageViewport(rootRef, `${inspectorOpen}:${menu.active}:${language}:${activeId}:${fits.notice?.status}:${tab}`)
  const frameImages = useMemo(() => tab === 'compare' ? comparisonFrames
    : baseProjection.ready ? [baseProjection.image] : [],
  [tab, comparisonFrames, baseProjection.ready, baseProjection.image])
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
    setSearchDirection(direction)
    open('search')
    search(direction)
    return true
  }, [observer, size, search, open, activeId])
  const locating = location.status === 'loading'
  const noticeMessage = notice?.reason === 'location' && !observer
    ? locating ? 'location.notices.locating'
      : location.error || 'location.notices.required'
    : notice?.reason === 'size' ? cutoutSizeError(size) : ''

  return (
    <main ref={rootRef} tabIndex={-1} className="app-viewport" data-inspector-open={inspectorOpen} aria-label={t('common.viewport')}>
      <div className="scene-layer" aria-label={t('common.scene')}>
        <Canvas orthographic camera={{ position: [0, 0, 0], near: 0.01, far: 250 }}>
          <SkyScene observer={observer} fits={fits} stars={stars} surfaceVisible={surfaceVisible}
            timestamp={clock.timestamp} onSkyClick={onSkyClick} frameImages={frameImages} viewport={viewport} focusVersion={focusVersion}
            layers={layers} appearance={appearance} frameId={playback.frameId}
            onImageZoom={tab === 'compare' ? undefined : fits.refine}
            searchDirection={searchDirection} />
        </Canvas>
      </div>
      <div className="ui-layer">
        <ContextToolbar clock={clock} location={location} fits={fits} menu={menu}
          stars={stars} surfaceVisible={surfaceVisible} setSurfaceVisible={setSurfaceVisible} />
        <LanguageSelect />
        <ImageInspector open={inspectorOpen} tab={tab} fits={fits} displayed={displayed} appearance={appearance}
          comparison={comparison} playback={playback} reason={t(reason)} primaryProjection={primaryProjection} frames={frames} projections={projections}
          onTabChange={(value) => { playback.pause(); setTab(value) }}
          onClose={() => { playback.pause(); fits.reset(); setTab('data'); open(null)
            requestAnimationFrame(() => rootRef.current?.focus({ preventScroll: true })) }}
          onCenter={() => { fits.refine(1); setFocusVersion((value) => value + 1) }} />
        <div className="status-region">
          <StatusNotice notice={starsNotice ?? fits.notice} />
        </div>
        {notice && <Tooltip key={notice.id} point={notice.point} message={t(noticeMessage)} open
          tone={notice.reason === 'location' && locating ? 'info' : 'error'} />}
      </div>
    </main>
  )
}
