import { useEffect, useMemo, useState } from 'react'
import { Matrix4, Vector3 } from 'three'
import { equatorialFrameBasis } from './coordinateUtils.js'

// Wrap future RA/Dec geometry in this frame to share the local horizon axes.
export default function EquatorialFrame({ observer, children }) {
  const [timestamp, setTimestamp] = useState(() => Date.now())

  useEffect(() => {
    if (!observer) return
    const interval = window.setInterval(() => setTimestamp(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [observer])

  const matrix = useMemo(() => {
    if (!observer) return new Matrix4()
    const axes = equatorialFrameBasis(observer, timestamp).map((axis) => new Vector3(...axis))
    return new Matrix4().makeBasis(...axes)
  }, [observer, timestamp])

  return <group matrix={matrix} matrixAutoUpdate={false}>{children}</group>
}
