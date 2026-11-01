uniform float time;
uniform float aspectRatio;

varying vec2 vUv;

// 時間で変わらない粒。画面に貼り付いたざらつきになる
float random(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// 中心からの距離の逆数で、中心ほど明るい円を作る。半径をノイズで揺らすので縁がうねる
float createArea(float baseSize, vec2 uv, vec2 center) {
  float size = baseSize * (0.5 + 0.5 * snoise(vec3(uv * 5.0, time * 0.1)));
  return clamp(size / length(center - uv), 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  uv.y /= aspectRatio;
  vec2 center = vec2(0.5, 0.5 / aspectRatio);

  vec3 blue = vec3(0.0, 0.2, 1.0);
  vec3 green = vec3(0.0, 1.0, 0.8);
  vec3 red = vec3(1.0, 0.0, 0.2);

  float noise = snoise(vec3(uv * 4.0, time * 0.2));
  float rough = 0.1 + 0.9 * random(uv * 5.0);

  // floor で 1 になったところだけが残る。半径の少し違う 2 つの差が、赤い縁になる
  float front = floor(createArea(0.18, uv, center));
  float back = floor(createArea(0.2, uv, center));
  float glow = createArea(0.195, uv, center);

  vec3 color = vec3(0.0);
  color += 1.4 * green * noise * front * rough;
  color += 1.4 * red * noise * (back - front) * rough;
  color += 5.0 * blue * (pow(glow, 2.0) - back) * rough;

  gl_FragColor = vec4(color, 1.0);
}
