import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3 } from 'three'
import { compassPosition } from './compassUtils.js'
import useTranslation from '../../i18n/useTranslation.js'

export default function CompassTracking({ markerRef }) {
  const { t } = useTranslation()
  const direction = useRef(new Vector3())
  useFrame(({ camera }) => {
    const marker = markerRef?.current
    if (!marker) return
    const position = compassPosition(camera.getWorldDirection(direction.current))
    if (!position) return
    // Update only the SVG marker, without rerendering the workspace every frame.
    const x = position.x.toFixed(2)
    const y = position.y.toFixed(2)
    if (marker.getAttribute('cx') !== x) marker.setAttribute('cx', x)
    if (marker.getAttribute('cy') !== y) marker.setAttribute('cy', y)
    const label = t('sky.compass.bearing', { degrees: Math.round(position.bearing) % 360 })
    if (marker.ownerSVGElement.getAttribute('aria-label') !== label) marker.ownerSVGElement.setAttribute('aria-label', label)
  })
  return null
}
