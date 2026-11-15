import SkyCameraRig from './SkyCameraRig.jsx'
import CelestialSphere from '../elements/CelestialSphere.jsx'
import HorizonDirections from '../elements/HorizonDirections.jsx'
import EquatorialFrame from './EquatorialFrame.jsx'
import SkyBackdrop from './SkyBackdrop.jsx'
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import FitsImage from '../elements/FitsImage.jsx'

export default function SkyScene({ observer, fits }) {
  const { gl } = useThree()
  useEffect(() => {
    fits.maxTextureSize.current = gl.capabilities.maxTextureSize
  }, [gl, fits.maxTextureSize])
  return (
    <>
      <SkyCameraRig onSkyClick={fits.armed ? fits.search : null} focus={fits.focus} />
      {fits.active && <FitsImage key={fits.active.metadata.id} active={fits.active} onError={fits.projectionError} />}
      <SkyBackdrop>
        <color attach="background" args={['#060c18']} />
        <EquatorialFrame observer={observer}>
          <CelestialSphere />
        </EquatorialFrame>
        <HorizonDirections />
      </SkyBackdrop>
    </>
  )
}
