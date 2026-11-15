import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, Vector3 } from 'three'
import { SKY } from '../../config/sky.js'
import { horizonFragmentShader, horizonVertexShader } from '../core/horizonSurfaceMaterial.js'

const ignoreRaycast = () => {}

export default function HorizonSurface() {
  const material = useRef(null)
  const lookDirection = useMemo(() => new Vector3(), [])
  const uniforms = useMemo(() => ({
    groundHeight: { value: -1 },
    surfaceOpacity: { value: 0.28 },
  }), [])

  useFrame(({ camera }) => {
    if (!material.current) return
    camera.getWorldDirection(lookDirection)
    material.current.uniforms.surfaceOpacity.value = 0.28 * (1 - 0.85 * Math.max(0, -lookDirection.y))
  })

  // Project the flat guide into sky directions so every ray starts at the observer
  return <mesh raycast={ignoreRaycast} renderOrder={-1}>
    <sphereGeometry args={[SKY.radius, 128, 96]} />
    <shaderMaterial ref={material} uniforms={uniforms}
      vertexShader={horizonVertexShader} fragmentShader={horizonFragmentShader}
      transparent side={BackSide} depthWrite={false} toneMapped={false} />
  </mesh>
}
