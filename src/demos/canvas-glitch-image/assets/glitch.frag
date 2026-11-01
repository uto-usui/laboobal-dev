uniform sampler2D uImage;
uniform vec2 uCover;
uniform vec2 uResolution;
uniform float uTime;

varying vec2 vUv;

const float INTERVAL = 3.0;

float random(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

// 画面の uv を、写真を画面いっぱいに切り取った uv に直してから読む
vec4 photo(vec2 uv) {
  return texture2D(uImage, (uv - 0.5) * uCover + 0.5);
}

void main() {
  float time = uTime;

  // 強さ。3 秒ごとに 1 へ跳ね、0.15 秒かけて 0 へ戻る。ふだんは弱く震え、ときどき大きく崩れる
  float strength = smoothstep(INTERVAL * 0.95, INTERVAL, INTERVAL - mod(time, INTERVAL));

  // 画面ごと揺らす量
  vec2 shake = vec2(strength * 8.0 + 0.1) * vec2(
    random(vec2(time)) * 0.01 - 1.0,
    random(vec2(sqrt(time))) * 0.01 - 2.0
  ) / uResolution;

  float y = vUv.y * uResolution.y;

  // 横の走査線のずれ。細かいびりびり、たまに走る太い線、ゆっくり下りる線の 3 つを足す
  float rgbWave = (
    snoise(vec3(0.0, y * 0.01, time * 400.0)) * (2.0 + strength * 2.0)
    + step(0.9999, sin(y * 0.005 + time * 2.0 + snoise(vec3(strength, y * 0.1, time * time) * 0.1))) * 5.0
    + step(0.9997, cos(y * 0.01 + time * 1.2)) * -10.0
  ) / uResolution.x;
  float rgbUvX = vUv.x + rgbWave;

  // 赤と青を左右に離す量。strength が 0 のときは小さく震えるだけ
  float rgbDiff = (
    100.0 * sin(time * 0.1) * 0.5 * strength
    + sin(time * 50.0 + vUv.y * 1.1) * (10.0 * strength + 1.0)
  ) / uResolution.x;

  float r = photo(vec2(rgbUvX + rgbDiff, vUv.y) + shake).r;
  float g = photo(vec2(rgbUvX, vUv.y)).g;
  float b = photo(vec2(rgbUvX - rgbDiff, vUv.y) + shake).b;

  // 砂嵐
  float whiteNoise = (random(vUv + mod(time, 10.0)) * 2.0 - 1.0) * (0.15 + strength * 0.15) * 0.2;

  // ブロックのノイズ。時間を floor で区切って、四角い欠けがぱっと入れ替わるようにする
  float bnTime = floor(time * 20.0) * 2.0;
  float noiseX = step((snoise(vec3(0.0, vUv.x * 3.0, bnTime)) + 1.0) / 2.5, 0.1 + strength * 1.3);
  float noiseY = step((snoise(vec3(0.0, vUv.y * 3.0, bnTime)) + 1.0) / 2.0, 0.1 + strength * 0.3);
  float bnMask = noiseX * noiseY;
  float bnUvX = vUv.x + sin(bnTime) * 0.1 + rgbWave;
  vec4 blockNoise = vec4(
    photo(vec2(bnUvX + rgbDiff, vUv.y)).r,
    photo(vec2(bnUvX, vUv.y)).g,
    photo(vec2(bnUvX - rgbDiff, vUv.y)).b,
    1.0
  ) * bnMask;

  float bnTime2 = floor(time * 25.0) * 3.0;
  float noiseX2 = step((snoise(vec3(0.0, vUv.x * 2.0, bnTime2)) + 1.0) / 2.0, 0.1 + strength * 0.5);
  float noiseY2 = step((snoise(vec3(0.0, vUv.y * 8.0, bnTime2)) + 1.0) / 2.5, 0.1 + strength * 0.3);
  float bnMask2 = noiseX2 * noiseY2;
  vec4 blockNoise2 = vec4(
    photo(vec2(bnUvX + rgbDiff, vUv.y)).r,
    photo(vec2(bnUvX, vUv.y)).g,
    photo(vec2(bnUvX - rgbDiff, vUv.y)).b,
    1.0
  ) * bnMask2;

  // 下ほど少し白く浮かせる
  float waveNoise = (sin(vUv.y) + 0.1) / 2.0 * (0.15 + strength * 0.2);

  gl_FragColor = vec4(r, g, b, 1.0) * (1.0 - bnMask - bnMask2)
    + (whiteNoise + blockNoise + blockNoise2 + waveNoise);
}
