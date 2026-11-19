import { FULLSCREEN, RANDOM } from '../../shared/gpu/wgsl'
import { ANGULAR_COUNT, ASSOCIATIONS, RADIANCE } from './appearance'
import { STEP, SOFTENING } from './initial'
import {
  REAL_STEP,
  GRAB_TIME,
  FREE_RADIUS,
  RETURN_STRENGTH,
  BULK_DRAG,
  OUTWARD_DRAG,
} from './interaction'

export const SIM_FIELDS = {
  dt: 'f32',
  softening2: 'f32',
  masses: 'u32',
  count: 'u32',
} as const

export const VIEW_FIELDS = {
  center: 'vec4f',
  right: 'vec4f',
  up: 'vec4f',
  extent: 'vec2f',
  resolution: 'vec2f',
  fraction: 'f32',
  exposure: 'f32',
  count: 'u32',
  faces: 'u32',
  highlight: 'f32',
} as const

// 質量点と光の標本は同じ並び。光の p.w は 0 なので、重力の源には使わない。
const BODY = /* wgsl */ `struct Body { p: vec4f, v: vec4f }`

export const gravity = (uniform: string) => /* wgsl */ `
${uniform}
${BODY}
@group(0) @binding(0) var<uniform> sim: Sim;
@group(0) @binding(1) var<storage, read> sources: array<Body>;
@group(0) @binding(2) var<storage, read> before: array<Body>;
@group(0) @binding(3) var<storage, read_write> after: array<Body>;
@group(0) @binding(4) var<storage, read> bulkMotion: array<vec4f>;
var<workgroup> tile: array<vec4f, 64>;

fn acceleration(i: u32, local: u32) -> vec3f {
  let p = before[i].p.xyz;
  var a = vec3f(0.0);
  for (var base = 0u; base < sim.masses; base += 64u) {
    tile[local] = sources[base + local].p;
    workgroupBarrier();
    for (var j = 0u; j < 64u; j++) {
      let d = tile[j].xyz - p;
      let inv = inverseSqrt(dot(d, d) + sim.softening2);
      a += d * (tile[j].w * inv * inv * inv);
    }
    workgroupBarrier();
  }
  return a;
}

// 最初だけ半刻み戻し、以後の速度を位置から半刻みずらした leapfrog にそろえる。
@compute @workgroup_size(64) fn initialize(
  @builtin(global_invocation_id) id: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let a = acceleration(id.x, lid.x);
  var b = before[id.x];
  b.v = vec4f(b.v.xyz - a * sim.dt * 0.5, b.v.w);
  after[id.x] = b;
}

@compute @workgroup_size(64) fn advance(
  @builtin(global_invocation_id) id: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  var a = acceleration(id.x, lid.x);
  let galaxy = select(0u, 1u, id.x >= arrayLength(&before) / 2u);
  var b = before[id.x];
  b.v = vec4f(b.v.xyz + a * sim.dt + bulkMotion[galaxy].xyz, b.v.w);
  b.p = vec4f(b.p.xyz + b.v.xyz * sim.dt, b.p.w);
  after[id.x] = b;
}
`

const PROJECT = /* wgsl */ `
fn project(p: vec3f) -> vec2f {
  return vec2f(dot(p - view.center.xyz, view.right.xyz), dot(p - view.center.xyz, view.up.xyz)) / view.extent;
}
`

const GEOMETRY = /* wgsl */ `
${BODY}
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> before: array<Body>;
@group(0) @binding(2) var<storage, read> after: array<Body>;
@group(0) @binding(3) var<storage, read> material: array<vec4f>;
${PROJECT}
fn position(i: u32) -> vec3f {
  return mix(before[i].p.xyz, after[i].p.xyz, view.fraction);
}
fn projectedPosition(i: u32) -> vec2f {
  return project(position(i)) * view.extent;
}
fn edgeStretch(a: u32, b: u32) -> f32 {
  let restLength = length(material[a].xy - material[b].xy);
  return length(position(a) - position(b)) / max(restLength, 0.000001);
}
`

// 抑制の物差しは近所の三角形の辺の伸びだけにする。尾全体の伸びは消さない。
export const deformation = (uniform: string) => /* wgsl */ `
${uniform}
${GEOMETRY}
@group(0) @binding(4) var<storage, read> triangles: array<u32>;
@group(0) @binding(5) var<storage, read_write> stretches: array<f32>;
@compute @workgroup_size(64) fn measure(@builtin(global_invocation_id) id: vec3u) {
  let face = id.x;
  if (face >= view.faces) { return; }
  let a = triangles[face * 3u];
  let b = triangles[face * 3u + 1u];
  let c = triangles[face * 3u + 2u];
  let ab = material[b].xy - material[a].xy;
  let ac = material[c].xy - material[a].xy;
  if (abs(ab.x * ac.y - ab.y * ac.x) < 0.00000001) {
    stretches[face] = 1.0;
    return;
  }
  stretches[face] = max(edgeStretch(a, b), max(edgeStretch(b, c), edgeStretch(c, a)));
}
`

export const surface = (uniform: string) => /* wgsl */ `
${uniform}
${GEOMETRY}
@group(0) @binding(4) var<storage, read> triangles: array<u32>;
@group(0) @binding(5) var<storage, read> stretches: array<f32>;
@group(0) @binding(6) var<storage, read> neighbors: array<vec4u>;
${RADIANCE}
fn area(a: vec2f, b: vec2f) -> f32 {
  return a.x * b.y - a.y * b.x;
}
struct SurfaceOut {
  @builtin(position) pos: vec4f,
  @location(0) material: vec2f,
  @location(1) @interpolate(flat) galaxy: f32,
  @location(2) density: f32,
  @location(3) @interpolate(flat) intact: f32,
}
@vertex fn vsSurface(@builtin(vertex_index) vertex: u32) -> SurfaceOut {
  let i = triangles[vertex];
  let halfCount = u32(view.count) / 2u;
  let first = (i / halfCount) * halfCount;
  let columns = ${ANGULAR_COUNT}u;
  let rows = halfCount / columns;
  let column = (i - first) % columns;
  // 中心の重複頂点では、一つ外の輪の面積を使ってゼロ除算を避ける。
  let row = max(1u, (i - first) / columns);
  let innerIndex = first + (row - 1u) * columns + column;
  let outerIndex = first + min(rows - 1u, row + 1u) * columns + column;
  let previousIndex = first + row * columns + (column + columns - 1u) % columns;
  let nextIndex = first + row * columns + (column + 1u) % columns;
  let restArea = abs(area(material[outerIndex].xy - material[innerIndex].xy,
    material[nextIndex].xy - material[previousIndex].xy));
  let deformedArea = abs(area(projectedPosition(outerIndex) - projectedPosition(innerIndex),
    projectedPosition(nextIndex) - projectedPosition(previousIndex)));
  let inverseArea = restArea / max(deformedArea, 0.00000001);
  var out: SurfaceOut;
  out.pos = vec4f(projectedPosition(i) / view.extent, 0.0, 1.0);
  out.material = material[i].xy;
  out.galaxy = material[i].z;
  // 面積比を頂点で求めて補間し、三角形ごとの明るさの段差を尾に残さない。
  out.density = 4.0 * (1.0 - exp(-inverseArea / 4.0));
  let face = vertex / 3u;
  let near = neighbors[face];
  let a = stretches[near.x];
  let b = stretches[near.y];
  let c = stretches[near.z];
  let median = max(min(a, b), min(max(a, b), c));
  // 一様に伸びた尾は残し、隣接面の中央値の三倍を超えた面だけ切る。
  out.intact = select(1.0, 0.0, stretches[face] > 3.0 * max(median, 0.000001));
  return out;
}
@fragment fn fsSurface(in: SurfaceOut) -> @location(0) vec4f {
  if (in.intact <= 0.0) { discard; }
  return vec4f(stellarLight(in.material, in.galaxy) * in.density * in.intact * (1.0 + in.galaxy * view.highlight), 0.0);
}
struct AssociationOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) strength: f32,
}
@vertex fn vsAssociation(@builtin(vertex_index) vertex: u32,
  @builtin(instance_index) instance: u32) -> AssociationOut {
  let galaxy = instance / ${ASSOCIATIONS}u;
  let k = instance % ${ASSOCIATIONS}u;
  let radius = 0.62 + f32(k) * 0.20;
  let bearing = spiralAngle(radius, f32(galaxy)) + f32(k % 2u) * 3.14159265 - 0.045;
  let halfCount = view.count / 2u;
  let rows = halfCount / ${ANGULAR_COUNT}u;
  let ring = pow(radius / 3.0, 1.0 / 1.35) * f32(rows - 1u);
  let sector = fract(bearing / 6.2831853 + 4.0) * ${ANGULAR_COUNT}.0;
  let row = u32(floor(ring));
  let column = u32(floor(sector));
  let a = galaxy * halfCount + row * ${ANGULAR_COUNT}u + column;
  let b = a + ${ANGULAR_COUNT}u;
  let c = galaxy * halfCount + row * ${ANGULAR_COUNT}u + (column + 1u) % ${ANGULAR_COUNT}u;
  let d = c + ${ANGULAR_COUNT}u;
  let x = fract(sector);
  let y = fract(ring);
  // 元の三角形上の重心座標を保ち、面を消した場所でも同じ光の標本を追う。
  var nucleus = position(a) * (1.0 - x - y) + position(b) * y + position(c) * x;
  if (x + y > 1.0) {
    nucleus = position(c) * (1.0 - y) + position(b) * (1.0 - x) + position(d) * (x + y - 1.0);
  }
  let corners = array<vec2f, 6>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1),
    vec2f(-1,1), vec2f(1,-1), vec2f(1,1));
  let q = corners[vertex] * 3.0;
  var out: AssociationOut;
  out.pos = vec4f(project(nucleus) + q * vec2f(0.055, 0.085) / view.extent, 0, 1);
  out.local = q;
  out.strength = exp(-radius / 1.3) * (1.0 + f32(galaxy) * view.highlight);
  return out;
}
@fragment fn fsAssociation(in: AssociationOut) -> @location(0) vec4f {
  let rr = dot(in.local, in.local);
  let profile = max(0.0, exp(-0.5 * rr) - exp(-4.5));
  return vec4f((vec3f(0.55, 0.90, 1.6) * profile +
    vec3f(2.2, 2.5, 3.0) * exp(-2.5 * rr)) * in.strength, 0);
}
struct CoreOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) strength: f32,
}
@vertex fn vsCore(@builtin(vertex_index) vertex: u32, @builtin(instance_index) galaxy: u32) -> CoreOut {
  let corners = array<vec2f, 6>(
    vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1),
    vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let first = galaxy * (u32(view.count) / 2u);
  var nucleus = vec3f(0.0);
  for (var j = 0u; j < 32u; j++) {
    nucleus += mix(before[first + j].p.xyz, after[first + j].p.xyz, view.fraction) / 32.0;
  }
  let q = corners[vertex] * 0.8;
  var out: CoreOut;
  out.pos = vec4f(project(nucleus) + q / view.extent, 0.0, 1.0);
  out.local = q;
  out.strength = 1.0 + f32(galaxy) * view.highlight;
  return out;
}
@fragment fn fsCore(in: CoreOut) -> @location(0) vec4f {
  let r2 = dot(in.local, in.local);
  let white = 7.0 * exp(-0.5 * r2 / (0.055 * 0.055));
  let warm = 1.8 * exp(-0.5 * r2 / (0.20 * 0.20));
  let edge = 1.0 - smoothstep(0.6, 0.8, sqrt(r2));
  return vec4f((vec3f(1.0, 0.96, 0.82) * white +
    vec3f(1.0, 0.74, 0.40) * warm) * edge * in.strength, 0.0);
}
`

export const composite = (uniform: string) => /* wgsl */ `
${uniform}
${FULLSCREEN}
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var density: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;
@fragment fn fs(in: FullOut) -> @location(0) vec4f {
  let light = textureSample(density, linearSampler, in.uv).rgb;
  let mapped = vec3f(1.0) - exp(-light * view.exposure);
  // 暗い尾をさらに切り落とさない。低輝度は平方根へなめらかにつなぎ、黒は黒のままにする。
  return vec4f(mapped / sqrt(mapped + vec3f(0.025)), 1.0);
}
`

export const background = (uniform: string) => /* wgsl */ `
${uniform}
${RANDOM}
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var density: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;
struct StarOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) color: vec3f,
  @location(2) uv: vec2f,
}
@vertex fn vs(@builtin(vertex_index) vertex: u32, @builtin(instance_index) i: u32) -> StarOut {
  let corners = array<vec2f, 6>(
    vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1),
    vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
  let seed = i * 17u + 9137u;
  let position = rand3(seed);
  let strength = rand(seed + 7u);
  let bright = smoothstep(0.96, 1.0, strength);
  let radius = 0.38 + 0.55 * position.z * position.z + 0.8 * bright;
  let q = corners[vertex] * 2.75;
  // 端でも星の中心が枠内に収まり、リサイズや再生で星が入れ替わらない。
  let uv = mix(vec2f(0.006), vec2f(0.994), position.xy);
  var out: StarOut;
  out.pos = vec4f((uv * 2.0 - 1.0) * vec2f(1, -1) + q * radius * 2.0 / view.resolution, 0, 1);
  out.uv = out.pos.xy * vec2f(0.5, -0.5) + 0.5;
  out.local = q;
  let tint = mix(vec3f(0.68, 0.80, 1.0), vec3f(1.0, 0.86, 0.69), rand(seed + 3u));
  out.color = tint * (0.018 + 0.22 * pow(strength, 4.0) + 0.32 * bright);
  return out;
}
@fragment fn fs(in: StarOut) -> @location(0) vec4f {
  let light = textureSample(density, linearSampler, in.uv).rgb;
  let cover = 1.0 - smoothstep(0.006, 0.045, dot(light, vec3f(0.2126, 0.7152, 0.0722)));
  let profile = max(0.0, exp(-0.5 * dot(in.local, in.local)) - exp(-3.78125));
  return vec4f(in.color * profile * cover, 0.0);
}
`

export const CONTROL_FIELDS = {
  anchor: 'vec4f',
  shift: 'vec4f',
  releaseVelocity: 'vec4f',
} as const

export const manipulation = (uniform: string) => /* wgsl */ `
${uniform}
${BODY}
@group(0) @binding(0) var<uniform> control: Control;
@group(0) @binding(1) var<storage, read> before: array<Body>;
@group(0) @binding(2) var<storage, read_write> after: array<Body>;
@group(0) @binding(3) var<storage, read> bulkMotion: array<vec4f>;
@compute @workgroup_size(64) fn relocate(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  var b = before[i];
  if (i >= arrayLength(&before) / 2u) {
    b.p = vec4f(b.p.xyz + control.shift.xyz, b.p.w);
    if (control.releaseVelocity.w > 0.0) {
      b.v = vec4f(b.v.xyz + bulkMotion[1].xyz, b.v.w);
    }
  }
  after[i] = b;
}
`

// 芯への共通の速度補正を作る。内部の回転と既存の尾の相対運動は保つ。
export const following = (uniform: string) => /* wgsl */ `
${uniform}
${BODY}
@group(0) @binding(0) var<uniform> control: Control;
@group(0) @binding(1) var<storage, read> bodies: array<Body>;
@group(0) @binding(2) var<storage, read_write> bulkMotion: array<vec4f>;
@group(0) @binding(3) var<storage, read> sources: array<Body>;
const rate = ${STEP / REAL_STEP};
const realStep = ${REAL_STEP};
fn core(galaxy: u32) -> Body {
  let first = galaxy * (arrayLength(&bodies) / 2u);
  var p = vec4f(0.0);
  var v = vec4f(0.0);
  for (var j = 0u; j < 32u; j++) {
    p += bodies[first + j].p / 32.0;
    v += bodies[first + j].v / 32.0;
  }
  return Body(p, v);
}
@compute @workgroup_size(1) fn release() {
  bulkMotion[0] = vec4f(0.0);
  bulkMotion[1] = vec4f(control.releaseVelocity.xyz / rate - core(1u).v.xyz, 0.0);
}
@compute @workgroup_size(1) fn follow(@builtin(global_invocation_id) id: vec3u) {
  let galaxy = id.x;
  let nucleus = core(galaxy);
  let p = nucleus.p.xyz;
  let v = nucleus.v.xyz * rate;
  if (galaxy == 1u && control.anchor.w > 0.0) {
    // 中心の輪の頂点は同じ位置から同じ力で動くため、平均位置の重力で補正できる。
    var coreGravity = vec3f(0.0);
    for (var k = 0u; k < arrayLength(&sources); k++) {
      let d = sources[k].p.xyz - p;
      let inv = inverseSqrt(dot(d, d) + ${SOFTENING ** 2});
      coreGravity += d * (sources[k].p.w * inv * inv * inv);
    }
    let desired = (control.anchor.xyz - p) * ${(1 - Math.exp(-REAL_STEP / GRAB_TIME)) / STEP};
    bulkMotion[galaxy] = vec4f(desired - nucleus.v.xyz - coreGravity * ${STEP}, 0.0);
    return;
  }
  let radius = length(p);
  let direction = p / max(radius, 0.000001);
  let outside = max(0.0, radius - ${FREE_RADIUS});
  let outward = max(0.0, dot(v, direction));
  let a = -${BULK_DRAG} * v - direction *
    (${RETURN_STRENGTH} * outside + ${OUTWARD_DRAG} * min(1.0, outside / 1.5) * outward);
  bulkMotion[galaxy] = vec4f(a * realStep / rate, 0.0);
}
`

export const tracking = (uniform: string) => /* wgsl */ `
${uniform}
${BODY}
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> bodies: array<Body>;
@group(0) @binding(2) var<storage, read_write> cores: array<Body>;
@compute @workgroup_size(1) fn track(@builtin(global_invocation_id) id: vec3u) {
  let first = id.x * (view.count / 2u);
  var p = vec4f(0.0);
  var v = vec4f(0.0);
  for (var j = 0u; j < 32u; j++) {
    p += bodies[first + j].p / 32.0;
    v += bodies[first + j].v / 32.0;
  }
  cores[id.x] = Body(p, v);
}
`
