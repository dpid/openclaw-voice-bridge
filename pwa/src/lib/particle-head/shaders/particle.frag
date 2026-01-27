uniform float time;

varying vec3 vColor;
varying float vRandom;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float dist = length(uv);

  float core = smoothstep(0.08, 0.0, dist);
  float glow = smoothstep(0.5, 0.0, dist);

  float alpha = core * 0.9 + glow * 0.3;

  vec3 finalColor = mix(vColor, vec3(1.0), core * 0.5);

  if (alpha < 0.01) discard;

  gl_FragColor = vec4(finalColor, alpha);
}
