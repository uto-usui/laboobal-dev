precision mediump float;

uniform float time;
uniform float aspectRatio;

varying vec2 vUv;

#pragma glslify: snoise3 = require(glsl-noise/simplex/3d)

float random(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float createArea(float baseSize, vec2 uv, vec2 center) {
  float size = baseSize * (0.5 + 0.5 * snoise3(vec3(uv.x * 5.0, uv.y * 5.0, time * 0.1)));
  float d = size / length(center - uv);
  d = clamp(d, 0.0, 1.0);
  return d;
}

void main() {
  vec2 uv = vUv;
  uv.y /= aspectRatio;
  vec2 center = vec2(0.5, 0.5 / aspectRatio);

  vec3 color = vec3(0.0);

  vec3 blue = vec3(0.0, 0.2, 1.0);
  vec3 green = vec3(0.0, 1.0, 0.8);
  vec3 red = vec3(1.0, 0.0, 0.2);

  float noise = snoise3(vec3(uv.x * 4.0, uv.y * 4.0, time * 0.2));
  float rough = (0.1 + 0.9 * random(uv * 5.0));

  float front = floor(createArea(0.18, uv, center));
  float back = floor(createArea(0.2, uv, center));
  float bg = createArea(0.195, uv, center);

  color += 1.4 * green * noise * front * rough;
  color += 1.4 * red * noise * (back - front) * rough;
  color += 5.0 * blue * (pow(bg, 2.0) - back) * rough;

  gl_FragColor = vec4(color, 1.0);
}
