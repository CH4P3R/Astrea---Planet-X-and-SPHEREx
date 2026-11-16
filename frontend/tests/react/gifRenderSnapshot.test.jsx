import { render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { OrthographicCamera } from 'three'
import GifRenderSnapshot from '../../src/three/core/GifRenderSnapshot.jsx'

const renderer = vi.hoisted(() => ({ camera: null, gl: null }))
vi.mock('@react-three/fiber', () => ({ useThree: () => renderer }))

it('samples the actual drawing buffer, current zoom and orientation on demand', () => {
  const camera = new OrthographicCamera(-400, 400, 300, -300)
  renderer.camera = camera
  renderer.gl = { getDrawingBufferSize: (size) => size.set(1600, 1200) }
  const snapshotRef = { current: null }
  const { unmount } = render(<GifRenderSnapshot snapshotRef={snapshotRef} />)
  const first = snapshotRef.current()
  expect(first.pixelsPerUnitX).toBe(2)
  expect(first.pixelsPerUnitY).toBe(2)
  camera.zoom = 3
  camera.rotation.z = Math.PI / 2
  const second = snapshotRef.current()
  expect(second.pixelsPerUnitX).toBe(6)
  expect(second.pixelsPerUnitY).toBe(6)
  expect(second.orientation.equals(camera.quaternion)).toBe(true)
  expect(second.orientation).not.toBe(camera.quaternion)
  expect(first.orientation.equals(second.orientation)).toBe(false)
  unmount()
  expect(snapshotRef.current).toBeNull()
})
