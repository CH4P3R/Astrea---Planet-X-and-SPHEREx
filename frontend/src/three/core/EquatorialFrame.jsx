import { useMemo } from 'react'
import { Matrix4, Vector3 } from 'three'
import { equatorialFrameBasis } from './coordinateUtils.js'

export default function EquatorialFrame({ observer, timestamp, children }) {

  const matrix = useMemo(() => {
    if (!observer) return new Matrix4()
    const axes = equatorialFrameBasis(observer, timestamp).map((axis) => new Vector3(...axis))
    return new Matrix4().makeBasis(...axes)
  }, [observer, timestamp])

  return <group matrix={matrix} matrixAutoUpdate={false}>{children}</group>
}
