varying vec2 vUv;

uniform sampler2D uTexture1;
uniform sampler2D uTexture2;
uniform vec2 uCover1;
uniform vec2 uCover2;
// 0 で 1 枚目、1 で 2 枚目
uniform float uProgress;
uniform float uIntensity;

void main() {
  vec2 uv = vUv;
  vec2 disp = vec2(cloud(uv));

  // 横: x だけをずらす。行ごとに横へ引き裂かれたようになる
  vec2 pos1 = vec2(uv.x + disp.x * uIntensity * uProgress, uv.y);
  vec2 pos2 = vec2(uv.x - disp.x * uIntensity * (1.0 - uProgress), uv.y);

  vec4 color1 = texture2D(uTexture1, cover(pos1, uCover1));
  vec4 color2 = texture2D(uTexture2, cover(pos2, uCover2));
  gl_FragColor = mix(color1, color2, uProgress);
}
