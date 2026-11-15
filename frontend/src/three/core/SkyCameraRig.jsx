import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Euler, MathUtils, Vector2, Vector3 } from 'three'
import { SKY } from '../../config/sky.js'
import { baseOrthographicZoom } from './skyViewUtils.js'
import { dampSkyRotation, skyDirectionAtPointer, skyDragRotation, skyRotationForDirection } from './skyDragUtils.js'

export default function SkyCameraRig({ onSkyClick, focus }) {
  const { get, gl, invalidate, size } = useThree()
  const rotation = useRef(new Euler(0, 0, 0, 'YXZ'))
  const targetRotation = useRef(new Euler(0, 0, 0, 'YXZ'))
  const zoomScale = useRef(SKY.initialZoom)

  useEffect(() => {
    const { camera } = get()
    camera.position.set(0, 0, 0)
    skyRotationForDirection(camera.getWorldDirection(new Vector3()), rotation.current.y, rotation.current)
    targetRotation.current.copy(rotation.current)
    camera.quaternion.setFromEuler(rotation.current)
    camera.updateMatrixWorld()
  }, [get])

  useFrame(({ camera }, delta) => {
    if (rotation.current.x === targetRotation.current.x && rotation.current.y === targetRotation.current.y) return
    dampSkyRotation(rotation.current, targetRotation.current, delta)
    camera.quaternion.setFromEuler(rotation.current)
    camera.updateMatrixWorld()
    invalidate()
  }, -1)

  // R3F sizes the orthographic frustum in CSS pixels. Fit its diagonal inside
  // the sphere, including at minimum zoom, without stretching the projection.
  const baseZoom = baseOrthographicZoom(size.width, size.height)

  useEffect(() => {
    if (!focus) return
    const { camera } = get()
    skyRotationForDirection(new Vector3(...focus.direction), rotation.current.y, targetRotation.current)
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
    const previousPointer = new Vector2()
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
      event.preventDefault()
      previousPointer.copy(pointer)
      targetRotation.current.copy(rotation.current)
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
      skyDragRotation(get().camera, pointer.x - previousPointer.x, pointer.y - previousPointer.y,
        targetRotation.current, targetRotation.current)
      previousPointer.copy(pointer)
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
