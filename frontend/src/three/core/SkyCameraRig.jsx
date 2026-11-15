import { useEffect, useRef } from 'react'
import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { MathUtils } from 'three'
import { SKY } from '../../config/sky.js'
import { baseOrthographicZoom } from './skyViewUtils.js'

export default function SkyCameraRig() {
  const { get, gl, invalidate, size } = useThree()
  const zoomScale = useRef(SKY.initialZoom)

  // R3F sizes the orthographic frustum in CSS pixels. Fit its diagonal inside
  // the sphere, including at minimum zoom, without stretching the projection.
  const baseZoom = baseOrthographicZoom(size.width, size.height)

  useEffect(() => {
    const { camera } = get()
    camera.zoom = baseZoom * zoomScale.current
    camera.updateProjectionMatrix()
    invalidate()
  }, [get, baseZoom, invalidate])

  useEffect(() => {
    const element = gl.domElement
    const zoom = (event) => {
      const { camera } = get()
      event.preventDefault()
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1)
      // Trackpad pinch is delivered as ctrl+wheel by browsers; two-finger scroll
      // uses ordinary wheel events. Both change orthographic scale only.
      const sensitivity = event.ctrlKey ? 0.008 : 0.002
      zoomScale.current = MathUtils.clamp(
        zoomScale.current * Math.exp(MathUtils.clamp(-delta * sensitivity, -0.5, 0.5)),
        SKY.minZoom, SKY.maxZoom,
      )
      camera.zoom = baseZoom * zoomScale.current
      camera.updateProjectionMatrix()
      invalidate()
    }
    element.addEventListener('wheel', zoom, { passive: false })
    return () => element.removeEventListener('wheel', zoom)
  }, [get, gl, invalidate, baseZoom])

  return <OrbitControls makeDefault target={[0, 0, -0.001]}
    enablePan={false} enableZoom={false} enableDamping dampingFactor={0.08}
    minDistance={0.001} maxDistance={0.001} rotateSpeed={-0.4}
    minPolarAngle={0.001} maxPolarAngle={Math.PI - 0.001} />
}
