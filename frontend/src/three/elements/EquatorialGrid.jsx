import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { SKY } from '../../config/sky.js'

export default function EquatorialGrid() {
  const lines = useMemo(() => {
    const lines = []
    // Right-handed equatorial reference: +X RA 18h, +Y NCP, -Z RA 0h.
    const point = (ra, dec) => {
      const alpha = ra * Math.PI / 180
      const delta = dec * Math.PI / 180
      return [-SKY.radius * Math.cos(delta) * Math.sin(alpha),
        SKY.radius * Math.sin(delta), -SKY.radius * Math.cos(delta) * Math.cos(alpha)]
    }
    for (let ra = 0; ra < 360; ra += SKY.raStep) {
      lines.push({ id: `ra-${ra}`, points: Array.from({ length: 181 }, (_, i) => point(ra, i - 90)) })
    }
    for (let dec = -75; dec <= 75; dec += SKY.decStep) {
      lines.push({ id: `dec-${dec}`, equator: dec === 0,
        points: Array.from({ length: 361 }, (_, ra) => point(ra, dec)) })
    }
    return lines
  }, [])

  return (
    <group>
      {lines.map(({ id, points, equator }) => (
        <Line key={id} points={points} color={equator ? '#91b9d6' : '#5d849f'}
          lineWidth={equator ? 1.1 : 0.65} transparent opacity={equator ? 0.7 : 0.4} />
      ))}
    </group>
  )
}
