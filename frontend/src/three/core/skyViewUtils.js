import { MathUtils } from 'three'
import { SKY } from '../../config/sky.js'

export function baseOrthographicZoom(width, height) {
  return Math.max(1, Math.hypot(width, height)) / SKY.visibleDiameter
}

export function captureSkyView(camera, rotation, targetRotation, width, height) {
  return { camera: camera.clone(false), rotation: rotation.clone(), targetRotation: targetRotation.clone(),
    width, height, zoomScale: camera.zoom / baseOrthographicZoom(width, height) }
}

export function restoreSkyView(camera, saved, rotation, targetRotation, width, height) {
  camera.copy(saved.camera, false)
  rotation.copy(saved.rotation)
  targetRotation.copy(saved.targetRotation)
  if (width !== saved.width || height !== saved.height) {
    const horizontal = width / saved.width
    const vertical = height / saved.height
    camera.left *= horizontal
    camera.right *= horizontal
    camera.top *= vertical
    camera.bottom *= vertical
    camera.zoom = baseOrthographicZoom(width, height) * saved.zoomScale
    if (camera.view) {
      camera.view.fullWidth *= horizontal
      camera.view.fullHeight *= vertical
      camera.view.width *= horizontal
      camera.view.height *= vertical
      camera.view.offsetX *= horizontal
      camera.view.offsetY *= vertical
    }
  }
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  return saved.zoomScale
}

export function interpolateSkyView(camera, from, to, progress) {
  const blend = MathUtils.clamp(progress, 0, 1)
  camera.position.lerpVectors(from.position, to.position, blend)
  camera.quaternion.slerpQuaternions(from.quaternion, to.quaternion, blend)
  camera.scale.lerpVectors(from.scale, to.scale, blend)
  camera.up.lerpVectors(from.up, to.up, blend).normalize()
  camera.zoom = Math.exp(MathUtils.lerp(Math.log(from.zoom), Math.log(to.zoom), blend))
  for (const key of ['left', 'right', 'top', 'bottom', 'near', 'far']) {
    camera[key] = MathUtils.lerp(from[key], to[key], blend)
  }
  const a = from.view?.enabled ? from.view : null
  const b = to.view?.enabled ? to.view : null
  camera.setViewOffset(1, 1,
    MathUtils.lerp(a ? a.offsetX / a.fullWidth : 0, b ? b.offsetX / b.fullWidth : 0, blend),
    MathUtils.lerp(a ? a.offsetY / a.fullHeight : 0, b ? b.offsetY / b.fullHeight : 0, blend),
    MathUtils.lerp(a ? a.width / a.fullWidth : 1, b ? b.width / b.fullWidth : 1, blend),
    MathUtils.lerp(a ? a.height / a.fullHeight : 1, b ? b.height / b.fullHeight : 1, blend))
  camera.updateMatrixWorld(true)
}

// Hysteresis keeps trackpad noise near the threshold from flickering the text.
export function compactDirectionsAtZoom(current, relativeZoom) {
  return current ? relativeZoom > 2.7 : relativeZoom >= 3
}
