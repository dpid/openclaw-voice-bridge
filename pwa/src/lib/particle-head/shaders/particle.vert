uniform float time;
uniform float animSpeed;
attribute float size;
attribute vec3 random;

varying vec3 vColor;
varying float vRandom;

void main() {
  vColor = color;
  vRandom = random.z;

  vec3 pos = position;

  float t = time * animSpeed * random.z;
  float ax = t + random.y;
  float ay = t * 0.8 + random.x;

  float amplitude = (0.3 + sin(random.x + t * 0.5) * 0.2) * random.z;
  pos.x += sin(ax + pos.y * 0.04) * amplitude;
  pos.y += cos(ay + pos.z * 0.04) * amplitude;
  pos.z += sin(ax * 0.9 + pos.x * 0.04) * amplitude;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

  float pulse = 0.9 + 0.1 * sin(time * 1.2 + random.y);
  gl_PointSize = size * pulse * (300.0 / -mvPosition.z);

  gl_Position = projectionMatrix * mvPosition;
}
