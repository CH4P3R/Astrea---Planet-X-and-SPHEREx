export const horizonVertexShader = `
  varying vec3 skyDirection;

  void main() {
    skyDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const horizonFragmentShader = `
  uniform float groundHeight;
  uniform float surfaceOpacity;
  varying vec3 skyDirection;

  float stroke(float distanceToLine, float width) {
    float aa = max(fwidth(distanceToLine), 0.001);
    return 1.0 - smoothstep(width, width + aa, abs(distanceToLine));
  }

  float grid(vec2 p, float spacing) {
    vec2 distanceToLine = abs(mod(p + spacing * 0.5, spacing) - spacing * 0.5);
    return stroke(min(distanceToLine.x, distanceToLine.y), 0.012);
  }

  void main() {
    vec3 direction = normalize(skyDirection);
    if (direction.y >= -0.0001) discard;

    // Intersect the observer's sky direction with the horizontal plane below it
    vec2 p = direction.xz * (groundHeight / direction.y);
    float radius = length(p);
    float detailFade = 1.0 - smoothstep(12.0, 32.0, radius);
    float lines = max(grid(p, 1.0) * 0.18, grid(p, 5.0) * 0.4);

    float rings = max(stroke(radius - 4.0, 0.018), stroke(radius - 8.0, 0.018));
    rings = max(rings, stroke(radius - 12.0, 0.025));
    rings = max(rings, stroke(radius - 20.0, 0.035));
    rings = max(rings, stroke(radius - 2.1, 0.025));

    float spokes = stroke(min(abs(p.x), abs(p.y)), 0.02);
    spokes *= smoothstep(2.1, 2.3, radius) * (1.0 - smoothstep(19.9, 20.1, radius));
    float reticle = stroke(min(abs(p.x), abs(p.y)), 0.012)
      * (1.0 - smoothstep(0.25, 0.3, radius));
    reticle = max(reticle, stroke(radius - 0.45, 0.012));

    float alpha = max(max(lines, rings * 0.8), max(spokes * 0.6, reticle));
    alpha *= detailFade * surfaceOpacity;
    if (alpha < 0.001) discard;
    gl_FragColor = vec4(vec3(0.45), alpha);
    #include <colorspace_fragment>
  }
`
