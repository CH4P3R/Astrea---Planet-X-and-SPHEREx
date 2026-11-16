import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { Vector2 } from 'three'

// Read the current camera and physical drawing-buffer size only when exporting
export default function GifRenderSnapshot({ snapshotRef }) {
  const { camera, gl } = useThree()
  useEffect(() => {
    const capture = () => {
      if (!camera.isOrthographicCamera) throw new Error('GIF export requires an orthographic camera')
      const size = gl.getDrawingBufferSize(new Vector2())
      return {
        orientation: camera.quaternion.clone(),
        pixelsPerUnitX: size.x * camera.zoom / (camera.right - camera.left),
        pixelsPerUnitY: size.y * camera.zoom / (camera.top - camera.bottom),
      }
    }
    snapshotRef.current = capture
    return () => { if (snapshotRef.current === capture) snapshotRef.current = null }
  }, [camera, gl, snapshotRef])
  return null
}
