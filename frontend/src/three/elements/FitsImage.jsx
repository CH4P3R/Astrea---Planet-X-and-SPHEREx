import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, DataTexture, DoubleSide, FloatType, NearestFilter, RedFormat, ShaderMaterial } from 'three'
import { SKY } from '../../config/sky.js'
import { loadProjection, observerContext } from '../../services/images.js'
import { sampleWindow } from '../core/imageDataUtils.js'

function createResources(active) {
  const { metadata, pixels, projection } = active
  const texture = new DataTexture(pixels.values, metadata.image.width, metadata.image.height, RedFormat, FloatType)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.generateMipmaps = false
  texture.flipY = false
  texture.needsUpdate = true
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(projection.directions[0].length), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(projection.uv), 2))
  geometry.setIndex(projection.indices)
  const material = new ShaderMaterial({
    uniforms: { pixels: { value: texture } },
    vertexShader: `varying vec2 imageUv;
      void main() { imageUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D pixels; varying vec2 imageUv;
      void main() {
        float value = texture2D(pixels, imageUv).r;
        if (value < 0.0) discard;
        float scaled = value * 10.0;
        float intensity = log(scaled + sqrt(scaled * scaled + 1.0)) / 2.99822295;
        gl_FragColor = vec4(vec3(intensity), 1.0);
        #include <colorspace_fragment>
      }`,
    side: DoubleSide,
    depthWrite: false,
    depthTest: false,
    transparent: true,
    toneMapped: false,
  })
  return { texture, geometry, material }
}

export default function FitsImage({ active, onError }) {
  const resources = useRef(null)
  const mesh = useRef(null)
  const projection = useRef(active.projection)

  useEffect(() => {
    const next = createResources(active)
    resources.current = next
    mesh.current.geometry = next.geometry
    mesh.current.material = next.material
    return () => {
      next.texture.dispose()
      next.geometry.dispose()
      next.material.dispose()
      resources.current = null
    }
  }, [active])

  useEffect(() => {
    const controller = new AbortController()
    let timer
    const refresh = async () => {
      try {
        const next = await loadProjection(active.metadata.id, observerContext(active.observer), controller.signal)
        if (!controller.signal.aborted) projection.current = next
      } catch (error) {
        if (!controller.signal.aborted) onError(error)
      }
      if (!controller.signal.aborted) timer = window.setTimeout(refresh, 90000)
    }
    timer = window.setTimeout(refresh, 90000)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [active, onError])

  useFrame(() => {
    const currentResources = resources.current
    if (!currentResources) return
    const current = projection.current
    const now = Date.now()
    currentResources.material.visible = now <= current.sample_times_ms.at(-1)
    const [a, b, fraction] = sampleWindow(current.sample_times_ms, now)
    const positions = currentResources.geometry.attributes.position
    const first = current.directions[a]
    const second = current.directions[b]
    for (let i = 0; i < positions.count; i += 1) {
      const offset = i * 3
      const x = first[offset] + (second[offset] - first[offset]) * fraction
      const y = first[offset + 1] + (second[offset + 1] - first[offset + 1]) * fraction
      const z = first[offset + 2] + (second[offset + 2] - first[offset + 2]) * fraction
      const scale = SKY.radius / Math.hypot(x, y, z)
      positions.setXYZ(i, x * scale, y * scale, z * scale)
    }
    positions.needsUpdate = true
  })

  return <mesh ref={mesh} frustumCulled={false} dispose={null} />
}
