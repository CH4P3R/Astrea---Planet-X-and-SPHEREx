import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils, Quaternion, Vector2, Vector3 } from 'three'
import { SKY } from '../../config/sky.js'
import { baseOrthographicZoom } from './skyViewUtils.js'
import { skyDirectionAtPointer, skyDragRotation } from './skyDragUtils.js'

export default function SkyCameraRig({ onSkyClick, focus }) {
  const { get, gl, invalidate, size } = useThree()
  const targetRotation = useRef(new Quaternion())
  const zoomScale = useRef(SKY.initialZoom)

  useEffect(() => {
    const { camera } = get()
    camera.position.set(0, 0, 0)
    targetRotation.current.copy(camera.quaternion)
    camera.updateMatrixWorld()
  }, [get])

  useFrame(({ camera }, delta) => {
    if (camera.quaternion.angleTo(targetRotation.current) < 1e-7) {
      camera.quaternion.copy(targetRotation.current)
      return
    }
    camera.quaternion.slerp(targetRotation.current, MathUtils.damp(0, 1, 10, delta))
    camera.updateMatrixWorld()
    invalidate()
  }, -1)

  // R3F sizes the orthographic frustum in CSS pixels. Fit its diagonal inside
  // the sphere, including at minimum zoom, without stretching the projection.
  const baseZoom = baseOrthographicZoom(size.width, size.height)

  useEffect(() => {
    if (!focus) return
    const { camera } = get()
    targetRotation.current.setFromUnitVectors(new Vector3(0, 0, -1), new Vector3(...focus.direction).normalize())
    zoomScale.current = MathUtils.clamp(SKY.visibleDiameter / (SKY.radius * MathUtils.degToRad(focus.size) * 1.5), SKY.minZoom, SKY.maxZoom)
    camera.zoom = baseZoom * zoomScale.current
    camera.updateProjectionMatrix()
    invalidate()
  }, [focus, get, baseZoom, invalidate])

  useEffect(() => {
    const { camera } = get()
    camera.zoom = baseZoom * zoomScale.current
    camera.updateProjectionMatrix()
    invalidate()
  }, [get, baseZoom, invalidate])

  useEffect(() => {
    const element = gl.domElement
    const pointer = new Vector2()
    const anchor = new Vector3()
    const dragRotation = new Quaternion()
    let pointerId = null
    let startX = 0
    let startY = 0
    let moved = false

    const readPointer = (event) => {
      const bounds = element.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return false
      pointer.set(
        MathUtils.clamp((event.clientX - bounds.left) / bounds.width, 0, 1) * 2 - 1,
        1 - MathUtils.clamp((event.clientY - bounds.top) / bounds.height, 0, 1) * 2,
      )
      return true
    }

    const startDrag = (event) => {
      if (pointerId !== null || !event.isPrimary || event.button !== 0 || !readPointer(event)) return
      const { camera } = get()
      const direction = skyDirectionAtPointer(camera, pointer.x, pointer.y)
      if (!direction) return
      event.preventDefault()
      anchor.copy(direction).applyQuaternion(camera.quaternion)
      dragRotation.copy(camera.quaternion)
      targetRotation.current.copy(camera.quaternion)
      pointerId = event.pointerId
      startX = event.clientX
      startY = event.clientY
      moved = false
      element.setPointerCapture(pointerId)
    }

    const drag = (event) => {
      if (event.pointerId !== pointerId || !readPointer(event)) return
      event.preventDefault()
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 5) moved = true
      // Keep the grabbed sky point at the cursor instead of scaling pixel deltas
      skyDragRotation(get().camera, pointer.x, pointer.y, anchor, dragRotation, targetRotation.current)
      invalidate()
    }

    const stopDrag = (event) => {
      if (event.pointerId !== pointerId) return
      const clicked = event.type === 'pointerup' && !moved && Math.hypot(event.clientX - startX, event.clientY - startY) <= 5
      pointerId = null
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
      if (clicked && onSkyClick && readPointer(event)) {
        const { camera } = get()
        const direction = skyDirectionAtPointer(camera, pointer.x, pointer.y)
        if (direction) onSkyClick(direction.applyQuaternion(camera.quaternion).toArray(), { x: event.clientX, y: event.clientY })
      }
    }

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
      if (pointerId !== null) {
        const direction = skyDirectionAtPointer(camera, pointer.x, pointer.y)
        if (direction) {
          anchor.copy(direction).applyQuaternion(targetRotation.current)
          dragRotation.copy(targetRotation.current)
        }
      }
      invalidate()
    }
    element.addEventListener('pointerdown', startDrag)
    element.addEventListener('pointermove', drag)
    element.addEventListener('pointerup', stopDrag)
    element.addEventListener('pointercancel', stopDrag)
    element.addEventListener('lostpointercapture', stopDrag)
    element.addEventListener('wheel', zoom, { passive: false })
    return () => {
      element.removeEventListener('pointerdown', startDrag)
      element.removeEventListener('pointermove', drag)
      element.removeEventListener('pointerup', stopDrag)
      element.removeEventListener('pointercancel', stopDrag)
      element.removeEventListener('lostpointercapture', stopDrag)
      element.removeEventListener('wheel', zoom)
      if (pointerId !== null && element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId)
    }
  }, [get, gl, invalidate, baseZoom, onSkyClick])

  return null
}
