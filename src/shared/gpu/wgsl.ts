/** シェーダーにつなげて使う WGSL の小さな部品 */

/** 整数のハッシュから 0〜1 の乱数（PCG） */
export const RANDOM = /* wgsl */ `
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rand(seed: u32) -> f32 { return f32(pcg(seed)) / 4294967295.0; }
fn rand3(seed: u32) -> vec3f {
  return vec3f(rand(seed), rand(seed ^ 0x9e3779b9u), rand(seed ^ 0x85ebca6bu));
}
`

/** 画面いっぱいの三角形 1 枚（3 頂点で描く）。uv は左上が 0 */
export const FULLSCREEN = /* wgsl */ `
struct FullOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
@vertex fn vsFull(@builtin(vertex_index) i: u32) -> FullOut {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  var o: FullOut;
  o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
  o.uv = vec2f(p.x, 1.0 - p.y);
  return o;
}
`

type Vec3 = [number, number, number]

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const normalize = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/**
 * 透視のカメラ。WebGPU の深度は 0〜1 なので、WebGL の行列とは z の写し方が違う。
 * 行列は列の順（WGSL の mat4x4f にそのまま入れられる）
 */
export const camera = (
  eye: Vec3,
  target: Vec3,
  fovY: number,
  aspect: number,
  near: number,
  far: number,
) => {
  const f = normalize(sub(target, eye))
  const r = normalize(cross(f, [0, 1, 0]))
  const u = cross(r, f)
  const t = 1 / Math.tan(fovY / 2)
  const view = [
    r[0],
    u[0],
    -f[0],
    0,
    r[1],
    u[1],
    -f[1],
    0,
    r[2],
    u[2],
    -f[2],
    0,
    -(r[0] * eye[0] + r[1] * eye[1] + r[2] * eye[2]),
    -(u[0] * eye[0] + u[1] * eye[1] + u[2] * eye[2]),
    f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2],
    1,
  ]
  const proj = [
    t / aspect,
    0,
    0,
    0,
    0,
    t,
    0,
    0,
    0,
    0,
    far / (near - far),
    -1,
    0,
    0,
    (near * far) / (near - far),
    0,
  ]
  const viewProj = new Float32Array(16)
  for (let c = 0; c < 4; c++)
    for (let r2 = 0; r2 < 4; r2++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += proj[k * 4 + r2] * view[c * 4 + k]
      viewProj[c * 4 + r2] = s
    }
  /** 画面の点（-1〜1、上が +1）を通る、カメラからの光線の向き */
  const ray = (x: number, y: number): Vec3 =>
    normalize([
      f[0] + (r[0] * x * aspect + u[0] * y) / t,
      f[1] + (r[1] * x * aspect + u[1] * y) / t,
      f[2] + (r[2] * x * aspect + u[2] * y) / t,
    ])
  return { viewProj, eye, forward: f, right: r, up: u, ray }
}
