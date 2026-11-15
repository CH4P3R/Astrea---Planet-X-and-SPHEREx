import { Canvas } from '@react-three/fiber'
import SkyScene from '../../three/core/SkyScene.jsx'
import useObserver from '../../hooks/useObserver.js'
import LocationControls from '../controls/LocationControls.jsx'
import FitsControls from '../controls/FitsControls.jsx'
import useFitsImage from '../../hooks/useFitsImage.js'

export default function AppViewport() {
  const location = useObserver()
  const fits = useFitsImage(location.observer)

  return (
    <main className="app-viewport" aria-label="Bóveda celeste tridimensional">
      <div className="scene-layer" aria-label="Esfera celeste y direcciones del horizonte local">
        <Canvas orthographic camera={{ position: [0, 0, 0], near: 0.01, far: 250 }}>
          <SkyScene observer={location.observer} fits={fits} />
        </Canvas>
      </div>
      <div className="ui-layer">
        <LocationControls {...location} />
        <FitsControls fits={fits} observer={location.observer} />
      </div>
    </main>
  )
}
