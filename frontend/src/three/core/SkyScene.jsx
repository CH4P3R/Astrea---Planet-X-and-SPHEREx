import SkyCameraRig from './SkyCameraRig.jsx'
import CelestialSphere from '../elements/CelestialSphere.jsx'
import HorizonDirections from '../elements/HorizonDirections.jsx'
import EquatorialFrame from './EquatorialFrame.jsx'
import SkyBackdrop from './SkyBackdrop.jsx'

export default function SkyScene({ observer }) {
  return (
    <>
      <SkyCameraRig />
      <SkyBackdrop>
        <color attach="background" args={['#060c18']} />
        <EquatorialFrame observer={observer}>
          <CelestialSphere />
        </EquatorialFrame>
        {observer && <HorizonDirections />}
      </SkyBackdrop>
    </>
  )
}
