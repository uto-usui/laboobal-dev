export const ANGULAR_COUNT = 128
export const DISK_RADIUS = 3
export const ASSOCIATIONS = 8
export const BACKGROUND_STARS = 224

// 初期円盤の座標で模様を描く。頂点の間も連続し、点の間隔やにじみに形が左右されない。
export const RADIANCE = /* wgsl */ `
fn spiralAngle(r: f32, galaxy: f32) -> f32 {
  return 2.1 * log(1.0 + r / 0.38) + galaxy * 1.7;
}
fn cloudNoise(p: vec2f) -> f32 {
  let cell = floor(p);
  let t = fract(p);
  let blend = t * t * (3.0 - 2.0 * t);
  let a = fract(sin(dot(cell, vec2f(127.1, 311.7))) * 43758.5453);
  let b = fract(sin(dot(cell + vec2f(1, 0), vec2f(127.1, 311.7))) * 43758.5453);
  let c = fract(sin(dot(cell + vec2f(0, 1), vec2f(127.1, 311.7))) * 43758.5453);
  let d = fract(sin(dot(cell + vec2f(1, 1), vec2f(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
}
fn stellarLight(material: vec2f, galaxy: f32) -> vec3f {
  let r = length(material);
  let angle = atan2(material.y, material.x);
  let spiral = spiralAngle(r, galaxy);
  let phase = 2.0 * (angle - spiral);
  let outside = smoothstep(0.22, 0.55, r);
  // 薄い青白い円盤の中に二本の明るい腕を残し、外へ行くほど幅と明るさを変える。
  // 雲の濃淡は連続する低周波の場にし、標本ごとの点や外縁の毛羽立ちを作らない。
  let clouds = 0.65 * cloudNoise(material * 5.0 + galaxy * 7.0) +
    0.35 * cloudNoise(material * 12.0 - galaxy * 3.0);
  let armPhase = phase + (clouds - 0.5) * 0.09;
  let arm = exp(-(1.0 - cos(armPhase)) / 0.065);
  let ridge = exp(-(1.0 - cos(armPhase + 0.06)) / 0.018);
  let envelope = exp(-r / 1.3) * (1.0 - smoothstep(2.25, ${DISK_RADIUS}.0, r));
  let variation = 0.66 + 0.55 * clouds;
  let continuum = envelope * (vec3f(0.085, 0.11, 0.16) +
    (vec3f(0.65, 0.86, 1.24) * arm + vec3f(0.55, 0.69, 0.92) * ridge) * outside * variation);
  // 腕の内側に沿う吸収も円盤と一緒に運ぶ。画面に固定した斜めの帯にはしない。
  let lane = exp(-(1.0 - cos(phase - 0.31)) / 0.012) * outside;
  let absorption = exp(-vec3f(2.3, 2.8, 3.3) * lane);
  let bulge = vec3f(1.0, 0.77, 0.46) * 0.58 * exp(-0.5 * pow(r / 0.34, 2.0));
  return continuum * absorption + bulge;
}
`
