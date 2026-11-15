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
  frameImages, viewport, focusVersion, primary, secondary, appearance, frame, searchDirection }) {
  const { gl } = useThree()
  const { setTextureLimit } = fits
  useEffect(() => {
    setTextureLimit(gl.capabilities.maxTextureSize)
  }, [gl, setTextureLimit])
  return (
    <>
      <SkyCameraRig onSkyClick={onSkyClick} images={frameImages} viewport={viewport} focusVersion={focusVersion}
        focusRequest={fits.focus} timestamp={timestamp} />
      {stars.snapshot && <Stars snapshot={stars.snapshot} timestamp={timestamp} />}
      <ImageLoadingMarker direction={searchDirection} status={fits.status} />
      {primary.image && <FitsImage key={primary.image.metadata.id} active={primary.image} timestamp={timestamp}
        pixels={appearance.pixels[0]} settings={appearance.settings} visible={primary.ready && frame === 'A'} />}
      {secondary.image && appearance.pixels[1] && <FitsImage key={secondary.image.metadata.id} active={secondary.image} timestamp={timestamp}
        pixels={appearance.pixels[1]} settings={appearance.settings} visible={secondary.ready && frame === 'B'} />}
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
