import { useEffect, useMemo, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { AdditiveBlending, BackSide, SRGBColorSpace, TextureLoader } from 'three'
import { SKY } from '../../config/sky.js'
import { SKY_DUST } from '../../config/skyDust.js'
import { GALACTIC_FRAME } from '../core/galacticFrame.js'

const vertexShader = `
  varying vec3 skyDirection;
  void main() {
    skyDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = `
  uniform sampler2D dustMap;
  uniform float opacity;
  varying vec3 skyDirection;

  void main() {
    vec3 direction = normalize(skyDirection);
    vec2 uv = vec2(
      atan(direction.z, direction.x) / 6.28318530718 + 0.5,
      asin(clamp(direction.y, -1.0, 1.0)) / 3.14159265359 + 0.5
    );
    // Feather opposite edges together: a generated panorama need not have
    // pixel-identical borders. Poles are already dark in the source image.
    float seam = 0.5 * (1.0 - smoothstep(0.0, 0.035, min(uv.x, 1.0 - uv.x)));
    vec3 haze = mix(texture2D(dustMap, uv).rgb,
      texture2D(dustMap, vec2(1.0 - uv.x, uv.y)).rgb, seam);
    gl_FragColor = vec4(haze, opacity);
    #include <colorspace_fragment>
  }
`

const ignoreRaycast = () => {}

export default function SkyDust() {
  const [texture, setTexture] = useState(null)
  const { invalidate } = useThree()
  const uniforms = useMemo(() => ({
    dustMap: { value: texture },
    opacity: { value: SKY_DUST.opacity },
  }), [texture])

  useEffect(() => {
    let disposed = false
    // This layer loads independently: no Suspense boundary can delay the sky,
    // and a missing decorative asset leaves the original background intact.
    const requestedTexture = new TextureLoader().load(SKY_DUST.textureUrl, (loaded) => {
      if (disposed) { loaded.dispose(); return }
      loaded.colorSpace = SRGBColorSpace
      setTexture(loaded)
      invalidate()
    }, undefined, () => { /* Keep the original sky on an asset load failure. */ })
    return () => {
      disposed = true
      requestedTexture.dispose()
    }
  }, [invalidate])

  if (!texture) return null

  return <mesh matrix={GALACTIC_FRAME} matrixAutoUpdate={false} raycast={ignoreRaycast} renderOrder={-2}>
    <sphereGeometry args={[SKY.radius + 0.5, 96, 64]} />
    <shaderMaterial uniforms={uniforms}
      vertexShader={vertexShader} fragmentShader={fragmentShader}
      side={BackSide} transparent blending={AdditiveBlending}
      depthTest={false} depthWrite={false} toneMapped={false} />
  </mesh>
}
