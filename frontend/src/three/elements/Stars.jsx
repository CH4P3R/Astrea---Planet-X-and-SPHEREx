import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, ShaderMaterial } from 'three'
import { SKY } from '../../config/sky.js'
import { interpolateStarPositions, skySnapshotIsCurrent } from '../core/starDataUtils.js'

const ignoreRaycast = () => {}

function createResources(snapshot) {
  const geometry = new BufferGeometry()
  const positions = new BufferAttribute(new Float32Array(snapshot.star_count * 3), 3).setUsage(DynamicDrawUsage)
  const colors = new Float32Array(snapshot.star_count * 3)
  const sizes = new Float32Array(snapshot.star_count)
  const brightness = new Float32Array(snapshot.star_count)
  const color = new Color()
  snapshot.stars.forEach((star, i) => {
    color.set(/^#[\da-f]{6}$/i.test(star.color_hex) ? star.color_hex : '#ffffff').toArray(colors, i * 3)
    const light = Math.min(1, 10 ** (-0.15 * (star.apparent_magnitude + 1.5)))
    sizes[i] = 2 + 7 * light
    brightness[i] = 0.35 + 0.65 * light
  })
  interpolateStarPositions(snapshot, snapshot.sample_times_ms[0], positions.array, SKY.radius)
  geometry.setAttribute('position', positions)
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setAttribute('starSize', new BufferAttribute(sizes, 1))
  geometry.setAttribute('starBrightness', new BufferAttribute(brightness, 1))
  const material = new ShaderMaterial({
    uniforms: { pixelRatio: { value: 1 } },
    vertexShader: `
      attribute vec3 color;
      attribute float starSize;
      attribute float starBrightness;
      uniform float pixelRatio;
      varying vec3 starColor;
      varying float brightness;
      void main() {
        starColor = color;
        brightness = starBrightness;
        gl_PointSize = starSize * pixelRatio;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 starColor;
      varying float brightness;
      void main() {
        float radius = length(gl_PointCoord * 2.0 - 1.0);
        if (radius > 1.0) discard;
        float alpha = (1.0 - smoothstep(0.08, 1.0, radius)) * brightness;
        gl_FragColor = vec4(starColor, alpha);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  })
  return { geometry, material }
}

export default function Stars({ snapshot, timestamp }) {
  const points = useRef(null)
  const resources = useRef(null)

  useEffect(() => {
    const next = createResources(snapshot)
    resources.current = next
    points.current.geometry = next.geometry
    points.current.material = next.material
    return () => {
      next.geometry.dispose()
      next.material.dispose()
      resources.current = null
    }
  }, [snapshot])

  useFrame(({ gl }) => {
    const current = resources.current
    if (!current) return
    const now = snapshot.mode === 'paused' ? timestamp : Date.now()
    points.current.visible = skySnapshotIsCurrent(snapshot, now)
    if (!points.current.visible) return
    current.material.uniforms.pixelRatio.value = gl.getPixelRatio()
    if (snapshot.mode === 'live') {
      const positions = current.geometry.attributes.position
      interpolateStarPositions(snapshot, now, positions.array, SKY.radius)
      positions.needsUpdate = true
    }
  })

  return <points ref={points} renderOrder={-1} raycast={ignoreRaycast} frustumCulled={false} dispose={null} />
}
