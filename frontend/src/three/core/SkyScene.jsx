import SkyCameraRig from './SkyCameraRig.jsx'
import CelestialSphere from '../elements/CelestialSphere.jsx'
import HorizonDirections from '../elements/HorizonDirections.jsx'
import EquatorialFrame from './EquatorialFrame.jsx'
import SkyBackdrop from './SkyBackdrop.jsx'
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import FitsImage from '../elements/FitsImage.jsx'
import Stars from '../elements/Stars.jsx'
import HorizonSurface from '../elements/HorizonSurface.jsx'
import ImageLoadingMarker from '../elements/ImageLoadingMarker.jsx'

export default function SkyScene({ observer, fits, stars, surfaceVisible, timestamp, onSkyClick,
  frameImages, viewport, focusVersion, layers, appearance, frameId, onImageZoom, searchDirection }) {
  const { gl } = useThree()
  const { setTextureLimit } = fits
  useEffect(() => {
    setTextureLimit(gl.capabilities.maxTextureSize)
  }, [gl, setTextureLimit])
  return (
    <>
      <SkyCameraRig onSkyClick={onSkyClick} onImageZoom={onImageZoom} images={frameImages} viewport={viewport} focusVersion={focusVersion}
        previewActive={Boolean(fits.active)} selectionPending={['searching', 'loading', 'results'].includes(fits.status)}
        focusRequest={fits.focus} timestamp={timestamp} selectionDirection={searchDirection} />
      {stars.snapshot && <Stars snapshot={stars.snapshot} timestamp={timestamp} />}
      <ImageLoadingMarker direction={searchDirection} status={fits.status} />
      {layers.map(({ image, pixels, ready }) => image && pixels && <FitsImage key={image.metadata.id}
        active={image} timestamp={timestamp} pixels={pixels} settings={appearance.settings}
        visible={ready && image.metadata.id === frameId} />)}
      <SkyBackdrop>
        <color attach="background" args={['#060c18']} />
        <EquatorialFrame observer={observer} timestamp={timestamp}>
          <CelestialSphere />
        </EquatorialFrame>
        {surfaceVisible && <HorizonSurface />}
        <HorizonDirections />
      </SkyBackdrop>
    </>
  )
}
