uniform sampler2D uText;
uniform vec2 uResolution;
uniform float uTime;
uniform float uSeed;

varying vec2 vUv;

// ノイズでノイズの座標をずらす（domain warping）。模様がうねりながらゆっくり流れる
float pattern(vec2 p) {
  vec2 q = vec2(snoise(p), snoise(p + vec2(5.4 + uTime * 0.1, 2.1)));
  return snoise(q);
}

void main() {
  // 模様の大きさを画面の長いほうの辺に合わせる。iframe の縦横比が変わっても、崩れ方が同じに見える
  float side = 2.0 * max(uResolution.x, uResolution.y);
  vec2 p = (vUv - 0.5) * uResolution / side + 0.5;

  // 横に 2.2、縦に 8.8。縦に細かく横に長いので、横へ流れる筋になる
  float n = pattern(vec2(p.x * 2.2, p.y * 8.8) + vec2(uSeed));
  // 8 乗して、ほとんどの場所は 0 に、ノイズの山のところだけ大きく残す。崩れるのは文字のごく一部になる
  n = pow(abs(n) * 0.8, 8.0);

  vec2 uv = vUv + 0.2 * n * side / uResolution;
  vec4 color = texture2D(uText, uv);
  gl_FragColor = vec4(color.rgb * color.a, 1.0);
}
