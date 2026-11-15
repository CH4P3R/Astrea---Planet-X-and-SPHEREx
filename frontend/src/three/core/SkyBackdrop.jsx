import { useState } from 'react'
import { createPortal, useFrame } from '@react-three/fiber'
import { Scene } from 'three'

// A true background pass: foreground images (including transparent ones) are
// drawn AFTER the directions, independent of their distance or material type.
export default function SkyBackdrop({ children }) {
  const [backdrop] = useState(() => new Scene())

  useFrame(({ gl, scene, camera }) => {
    const autoClear = gl.autoClear
    try {
      gl.autoClear = true
      gl.render(backdrop, camera)
      gl.autoClear = false
      gl.clearDepth()
      gl.render(scene, camera)
    } finally {
      gl.autoClear = autoClear
    }
  }, 1)

  return createPortal(children, backdrop)
}
