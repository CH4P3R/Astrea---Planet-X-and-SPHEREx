import { Euler, MathUtils, Vector3 } from 'three'
import { SKY } from '../../config/sky.js'

const pitchLimit = Math.PI / 2 - 1e-6

export function skyDirectionAtPointer(camera, x, y, target = new Vector3()) {
  const localX = (camera.left + camera.right) / 2 + x * (camera.right - camera.left) / (2 * camera.zoom)
  const localY = (camera.top + camera.bottom) / 2 + y * (camera.top - camera.bottom) / (2 * camera.zoom)
  const depthSquared = SKY.radius ** 2 - localX ** 2 - localY ** 2
  if (depthSquared < 0) return null
  return target.set(localX, localY, -Math.sqrt(depthSquared)).normalize()
}

export function skyRotationForDirection(direction, previousYaw = 0, target = new Euler()) {
  const horizontal = Math.hypot(direction.x, direction.z)
  const pitch = Math.atan2(direction.y, horizontal)
  const yaw = horizontal < 1e-12 ? previousYaw : Math.atan2(-direction.x, -direction.z)
  const turn = Math.atan2(Math.sin(yaw - previousYaw), Math.cos(yaw - previousYaw))
  return target.set(MathUtils.clamp(pitch, -pitchLimit, pitchLimit), previousYaw + turn, 0, 'YXZ')
}

export function skyDragRotation(camera, deltaX, deltaY, rotation, target = new Euler()) {
  // Pointer deltas use normalized screen coordinates, with positive Y pointing up
  const horizontal = Math.asin(Math.min(1, (camera.right - camera.left) / (2 * camera.zoom * SKY.radius)))
  const vertical = Math.asin(Math.min(1, (camera.top - camera.bottom) / (2 * camera.zoom * SKY.radius)))
  return target.set(
    MathUtils.clamp(rotation.x - deltaY * vertical, -pitchLimit, pitchLimit),
    rotation.y + deltaX * horizontal,
    0,
    'YXZ',
  )
}

export function dampSkyRotation(rotation, target, delta) {
  const blend = 1 - Math.exp(-10 * Math.min(delta, 0.1))
  const pitch = rotation.x + (target.x - rotation.x) * blend
  const yaw = rotation.y + (target.y - rotation.y) * blend
  // Interpolate the two axes independently so intermediate frames also stay level
  return rotation.set(
    Math.abs(target.x - pitch) < 1e-8 ? target.x : pitch,
    Math.abs(target.y - yaw) < 1e-8 ? target.y : yaw,
    0,
    'YXZ',
  )
}
