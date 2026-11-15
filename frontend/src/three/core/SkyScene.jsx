import SkyCameraRig from './SkyCameraRig.jsx'
import CelestialSphere from '../elements/CelestialSphere.jsx'
import HorizonDirections from '../elements/HorizonDirections.jsx'
import EquatorialFrame from './EquatorialFrame.jsx'
import SkyBackdrop from './SkyBackdrop.jsx'
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import FitsImage from '../elements/FitsImage.jsx'

export default function SkyScene({ observer, fits, timestamp, onSkyClick }) {
  const { gl } = useThree()
  const { setTextureLimit } = fits
  useEffect(() => {
    setTextureLimit(gl.capabilities.maxTextureSize)
  }, [gl, setTextureLimit])
  return (
    <>
      <SkyCameraRig onSkyClick={onSkyClick} focus={fits.focus} />
      {fits.active && <FitsImage key={fits.active.metadata.id} active={fits.active} timestamp={timestamp} onError={fits.projectionError} />}
      <SkyBackdrop>
        <color attach="background" args={['#060c18']} />
        <EquatorialFrame observer={observer} timestamp={timestamp}>
          <CelestialSphere />
        </EquatorialFrame>
        <HorizonDirections />
      </SkyBackdrop>
    </>
  )
}
