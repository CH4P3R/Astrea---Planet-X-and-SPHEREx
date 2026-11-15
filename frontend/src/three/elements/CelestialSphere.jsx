import { BackSide } from 'three'
import { SKY } from '../../config/sky.js'

const vertexShader = `
  varying vec3 sphereDirection;
  varying vec3 viewNormal;

  void main() {
    sphereDirection = normalize(position);
    viewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = `
  varying vec3 sphereDirection;
  varying vec3 viewNormal;

  void main() {
    vec3 direction = normalize(sphereDirection);
    float latitude = smoothstep(-1.0, 1.0, direction.y);
    vec3 color = mix(vec3(0.004, 0.009, 0.016), vec3(0.001, 0.002, 0.005), latitude);

    // Broad, fixed shading gives the surface depth without geometric edges.
    float glow = pow(max(dot(direction, normalize(vec3(-0.6, 0.25, -1.0))), 0.0), 3.0);
    color += vec3(0.002, 0.005, 0.009) * glow;
    float curvature = pow(1.0 - abs(normalize(viewNormal).z), 1.5);
    color *= 1.0 - 0.55 * curvature;

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export default function CelestialSphere() {
  return (
    <mesh>
      <sphereGeometry args={[SKY.radius + 1, 96, 64]} />
      <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} side={BackSide} />
    </mesh>
  )
}
