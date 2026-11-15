import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Euler, MathUtils, Quaternion, Vector2, Vector3 } from 'three'
import { gsap } from 'gsap'
import { SKY } from '../../config/sky.js'
import { baseOrthographicZoom, captureSkyView, interpolateSkyView, restoreSkyView } from './skyViewUtils.js'
import { dampSkyRotation, skyDirectionAtPointer, skyDragRotation, skyRotationForDirection } from './skyDragUtils.js'
import { imageFrame, zoomImageFrame } from './imageFrameUtils.js'

export default function SkyCameraRig({ onSkyClick, onImageZoom, images = [], viewport, focusVersion = 0,
  previewActive = false, selectionPending = false, selectionDirection, focusRequest, timestamp }) {
  const { get, gl, invalidate, size } = useThree()
  const rotation = useRef(new Euler(0, 0, 0, 'YXZ'))
  const targetRotation = useRef(new Euler(0, 0, 0, 'YXZ'))
  const zoomScale = useRef(SKY.initialZoom)
  const following = useRef(false)
  const imageZoom = useRef(1)
  const skyView = useRef(null)
  const selectionView = useRef(null)
  const focusKey = useRef(null)
  const tween = useRef(null)
  const returning = useRef(null)
  const frameOrientation = useRef(new Quaternion())
  const frameCache = useRef(null)
  const transition = useRef({ progress: 1, quaternion: new Quaternion(), zoom: 1, offsetX: 0, offsetY: 0 })
  const imageId = images[0]?.metadata.id
  const partnerId = images[1]?.metadata.id
  // Fit the initial orthographic frustum inside the sky sphere
  const baseZoom = baseOrthographicZoom(size.width, size.height)

  useEffect(() => {
    const { camera } = get()
    camera.position.set(0, 0, 0)
    skyRotationForDirection(camera.getWorldDirection(new Vector3()), rotation.current.y, rotation.current)
    targetRotation.current.copy(rotation.current)
    camera.quaternion.setFromEuler(rotation.current)
    camera.updateMatrixWorld()
  }, [get])

  useFrame(({ camera }, delta) => {
    if (returning.current) {
      const motion = returning.current
      interpolateSkyView(camera, motion.from, motion.to, motion.progress)
      zoomScale.current = camera.zoom / baseZoom
      return
    }
    if (following.current && images.length && viewport) {
      const at = images[0].timeContext.mode === 'live' ? Date.now() : timestamp
      const bucket = images[0].timeContext.mode === 'live' ? Math.floor(at / 1000) * 1000 : at
      let cache = frameCache.current
      if (!cache || cache.bucket !== bucket || cache.images !== images || cache.viewport !== viewport
        || cache.width !== size.width || cache.height !== size.height) {
        const first = Math.max(...images.map((image) => image.projection.sample_times_ms[0]))
        const last = Math.min(...images.map((image) => image.projection.sample_times_ms.at(-1)))
        const start = Math.min(last, Math.max(first, bucket))
        const end = Math.min(last, Math.max(first, bucket + 1000))
        cache = { bucket, images, viewport, width: size.width, height: size.height, start, end,
          from: imageFrame(images, start, viewport, size.width, size.height, frameOrientation.current),
          to: imageFrame(images, end, viewport, size.width, size.height, frameOrientation.current) }
        frameCache.current = cache
      }
      // Interpolate cached bounds instead of scanning the WCS mesh at every frame
      const blend = cache.end > cache.start ? MathUtils.clamp((at - cache.start) / (cache.end - cache.start), 0, 1) : 0
      const interpolated = cache.from && cache.to ? {
        quaternion: cache.from.quaternion.clone().slerp(cache.to.quaternion, blend),
        zoom: Math.min(cache.from.zoom, cache.to.zoom),
        offsetX: MathUtils.lerp(cache.from.offsetX, cache.to.offsetX, blend),
        offsetY: MathUtils.lerp(cache.from.offsetY, cache.to.offsetY, blend),
      } : null
      if (!interpolated) return
      const target = zoomImageFrame(interpolated, imageZoom.current, viewport, size.width, size.height)
      const motion = transition.current
      const progress = motion.progress
      camera.quaternion.slerpQuaternions(motion.quaternion, target.quaternion, progress)
      camera.zoom = Math.exp(MathUtils.lerp(Math.log(motion.zoom), Math.log(target.zoom), progress))
      camera.setViewOffset(size.width, size.height,
        MathUtils.lerp(motion.offsetX, target.offsetX, progress), MathUtils.lerp(motion.offsetY, target.offsetY, progress),
        size.width, size.height)
      zoomScale.current = camera.zoom / baseZoom
      camera.updateMatrixWorld()
      return
    }
    if (rotation.current.x === targetRotation.current.x && rotation.current.y === targetRotation.current.y) return
    const roll = rotation.current.z
    dampSkyRotation(rotation.current, targetRotation.current, delta)
    rotation.current.z = roll
    camera.quaternion.setFromEuler(rotation.current)
    camera.updateMatrixWorld()
    invalidate()
  }, -1)

  useEffect(() => {
    const { camera } = get()
    tween.current?.kill()
    if (returning.current) {
      rotation.current.setFromQuaternion(camera.quaternion, 'YXZ')
      targetRotation.current.copy(rotation.current)
    }
    returning.current = null
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1.8
    if (!previewActive) {
      frameCache.current = null
      following.current = false
      if (skyView.current) {
        const saved = skyView.current
        const destination = camera.clone(false)
        restoreSkyView(destination, saved, saved.rotation.clone(), saved.targetRotation.clone(), size.width, size.height)
        const motion = { progress: 0, from: camera.clone(false), to: destination }
        returning.current = motion
        tween.current = gsap.to(motion, { progress: 1, duration, ease: 'power2.inOut', onUpdate: invalidate,
          onComplete: () => {
            zoomScale.current = restoreSkyView(camera, saved, rotation.current, targetRotation.current, size.width, size.height)
            targetRotation.current.copy(rotation.current)
            skyView.current = null
            selectionView.current = null
            returning.current = null
            imageZoom.current = 1
            focusKey.current = null
            invalidate()
          } })
        return () => tween.current?.kill()
      } else {
        camera.zoom = baseOrthographicZoom(size.width, size.height) * zoomScale.current
        camera.updateProjectionMatrix()
      }
      if (selectionPending && !selectionView.current) {
        selectionView.current = captureSkyView(camera, rotation.current, targetRotation.current, size.width, size.height)
      } else if (!selectionPending) selectionView.current = null
      imageZoom.current = 1
      focusKey.current = null
      if (selectionPending && selectionDirection) {
        const destination = camera.clone(false)
        const centeredRotation = skyRotationForDirection(new Vector3(...selectionDirection), rotation.current.y)
        destination.quaternion.setFromEuler(centeredRotation)
        destination.clearViewOffset()
        destination.updateMatrixWorld()
        const motion = { progress: 0, from: camera.clone(false), to: destination }
        returning.current = motion
        tween.current = gsap.to(motion, {
          progress: 1, duration: duration ? 0.8 : 0, ease: 'power2.inOut', onUpdate: invalidate,
          onComplete: () => {
            interpolateSkyView(camera, motion.from, motion.to, 1)
            rotation.current.copy(centeredRotation)
            targetRotation.current.copy(centeredRotation)
            returning.current = null
            invalidate()
          },
        })
        return () => tween.current?.kill()
      }
      camera.updateMatrixWorld()
      invalidate()
      return
    }
    if (!skyView.current) {
      skyView.current = selectionView.current ?? captureSkyView(camera, rotation.current, targetRotation.current, size.width, size.height)
      selectionView.current = null
    }
    if (!imageId || !viewport) return
    const key = `${imageId}:${focusVersion}`
    if (focusKey.current !== key) {
      imageZoom.current = 1
      focusKey.current = key
      frameOrientation.current.copy(camera.quaternion)
      frameCache.current = null
    }
    following.current = true
    const motion = transition.current
    motion.quaternion.copy(camera.quaternion)
    motion.zoom = camera.zoom
    motion.offsetX = camera.view?.enabled ? camera.view.offsetX : 0
    motion.offsetY = camera.view?.enabled ? camera.view.offsetY : 0
    motion.progress = 0
    tween.current = gsap.to(motion, { progress: 1, duration,
      ease: 'power2.inOut', onUpdate: invalidate })
    return () => tween.current?.kill()
  }, [imageId, partnerId, viewport, focusVersion, focusRequest, previewActive, selectionPending, selectionDirection, get, invalidate, size.width, size.height])

  useEffect(() => {
    const element = gl.domElement
    const pointer = new Vector2()
    const previousPointer = new Vector2()
    let pointerId = null
    let startX = 0
    let startY = 0
    let moved = false
    let zoomTimer

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
      if (following.current || returning.current) return
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
      const roll = targetRotation.current.z
      skyDragRotation(get().camera, pointer.x - previousPointer.x, pointer.y - previousPointer.y,
        targetRotation.current, targetRotation.current)
      targetRotation.current.z = roll
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
        if (direction) {
          const saved = captureSkyView(camera, rotation.current, targetRotation.current, size.width, size.height)
          if (onSkyClick(direction.applyQuaternion(camera.quaternion).toArray(), { x: event.clientX, y: event.clientY })) {
            selectionView.current = saved
          }
        }
      }
    }

    const zoom = (event) => {
      const { camera } = get()
      event.preventDefault()
      if (returning.current) return
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1)
      // Trackpad pinch is delivered as ctrl+wheel by browsers; two-finger scroll
      // uses ordinary wheel events. Both change orthographic scale only.
      const sensitivity = event.ctrlKey ? 0.008 : 0.002
      const factor = Math.exp(MathUtils.clamp(-delta * sensitivity, -0.5, 0.5))
      if (following.current) {
        imageZoom.current = MathUtils.clamp(imageZoom.current * factor, 1, 64)
        window.clearTimeout(zoomTimer)
        zoomTimer = window.setTimeout(() => onImageZoom?.(imageZoom.current), 350)
        invalidate()
        return
      }
      zoomScale.current = MathUtils.clamp(
        zoomScale.current * factor,
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
      window.clearTimeout(zoomTimer)
      element.removeEventListener('pointerdown', startDrag)
      element.removeEventListener('pointermove', drag)
      element.removeEventListener('pointerup', stopDrag)
      element.removeEventListener('pointercancel', stopDrag)
      element.removeEventListener('lostpointercapture', stopDrag)
      element.removeEventListener('wheel', zoom)
      if (pointerId !== null && element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId)
    }
  }, [get, gl, invalidate, baseZoom, onSkyClick, onImageZoom, size.width, size.height])

  return null
}
