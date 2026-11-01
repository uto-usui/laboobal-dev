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
  vec2 disp = vec2(grain(uv));

  // ずらし: 横に大きく、縦に少しずらす。1 枚目と 2 枚目で縦のずれの量を変えている
  vec2 pos1 = vec2(
    uv.x + disp.y * uIntensity * uProgress,
    uv.y - disp.y * uIntensity * uProgress * 0.25
  );
  vec2 pos2 = vec2(
    uv.x - disp.x * uIntensity * (1.0 - uProgress),
    uv.y + disp.y * uIntensity * (1.0 - uProgress) * 0.5
  );

  vec4 color1 = texture2D(uTexture1, cover(pos1, uCover1));
  vec4 color2 = texture2D(uTexture2, cover(pos2, uCover2));
  gl_FragColor = mix(color1, color2, uProgress);
}
