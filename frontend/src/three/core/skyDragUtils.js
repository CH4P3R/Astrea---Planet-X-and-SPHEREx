import { Quaternion, Vector3 } from 'three'
import { SKY } from '../../config/sky.js'

export function skyDirectionAtPointer(camera, x, y, target = new Vector3()) {
  const localX = (camera.left + camera.right) / 2 + x * (camera.right - camera.left) / (2 * camera.zoom)
  const localY = (camera.top + camera.bottom) / 2 + y * (camera.top - camera.bottom) / (2 * camera.zoom)
  const depthSquared = SKY.radius ** 2 - localX ** 2 - localY ** 2
  if (depthSquared < 0) return null
  return target.set(localX, localY, -Math.sqrt(depthSquared)).normalize()
}

export function skyDragRotation(camera, x, y, anchor, rotation, target = new Quaternion()) {
  const direction = skyDirectionAtPointer(camera, x, y)
  if (!direction) return null
  direction.applyQuaternion(rotation)
  const correction = new Quaternion().setFromUnitVectors(direction, anchor)
  return target.copy(rotation).premultiply(correction).normalize()
}
