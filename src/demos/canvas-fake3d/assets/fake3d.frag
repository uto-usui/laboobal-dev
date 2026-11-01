uniform sampler2D uImage;
uniform sampler2D uDepth;
uniform vec2 uMouse;
uniform vec2 uThreshold;
uniform vec2 uCover;

varying vec2 vUv;

// 0〜1 の外に出た uv を、端で折り返して戻す。ずらしたときに画面の端に伸びた色が出ない
vec2 mirrored(vec2 v) {
  vec2 m = mod(v, 2.0);
  return mix(m, 2.0 - m, step(1.0, m));
}

void main() {
  vec2 uv = (vUv - 0.5) * uCover + 0.5;
  float depth = texture2D(uDepth, mirrored(uv)).r;
  // 深度 0.5 の面は動かず、手前はマウスの側へ、奥は反対へずれる
  vec2 shifted = uv + (depth - 0.5) * uMouse / uThreshold;
  gl_FragColor = texture2D(uImage, mirrored(shifted));
}
