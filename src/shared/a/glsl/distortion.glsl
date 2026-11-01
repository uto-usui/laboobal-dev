// distortion-slider の 4 本で使う。simplex-noise.glsl の後ろに足す。
// 旧デモはゆがませる模様を画像（グレースケールのノイズ）で持っていた。ここではその代わりをノイズから計算する

// 細かいノイズを重ねる（fbm）。値はおよそ -1〜1
float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amp * snoise(p);
    p = p * 2.03 + 17.0;
    amp *= 0.5;
  }
  return value;
}

// 斜めの筋が入った、明暗の強い模様（旧の 01.png に近いもの）。0〜1
float grain(vec2 uv) {
  // 45 度近く回して片方向に縮めると、斜めに流れる筋になる
  vec2 p = mat2(0.8, -0.6, 0.6, 0.8) * uv * vec2(2.5, 6.0);
  return smoothstep(-0.55, 0.55, fbm(p));
}

// 雲のようにむらのある模様（旧の 03.jpg に近いもの）。0〜1
float cloud(vec2 uv) {
  return smoothstep(-0.7, 0.7, fbm(uv * 4.0));
}

// 画像を、縦横比を保ったまま面いっぱいに敷く（CSS の object-fit: cover と同じ）。scale は JS で計算して渡す
vec2 cover(vec2 uv, vec2 scale) {
  return (uv - 0.5) * scale + 0.5;
}
