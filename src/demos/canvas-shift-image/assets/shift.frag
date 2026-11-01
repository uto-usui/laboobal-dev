uniform sampler2D uImage;
uniform vec2 uCover;
uniform vec2 uShift;

varying vec2 vUv;

void main() {
  vec2 uv = (vUv - 0.5) * uCover + 0.5;
  // 赤、緑、青を 1 倍、2 倍、4 倍とずらす。色ごとに離れ方が違うので、虹色のにじみになる
  float r = texture2D(uImage, uv - uShift).r;
  float g = texture2D(uImage, uv - uShift * 2.0).g;
  float b = texture2D(uImage, uv - uShift * 4.0).b;
  gl_FragColor = vec4(r, g, b, 1.0);
}
