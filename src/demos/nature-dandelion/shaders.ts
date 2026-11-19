import { FULLSCREEN, RANDOM } from '../../shared/gpu/wgsl'
import { FLIGHT, flightWGSL } from './flight'

export const COUNT = 72
export const HAIRS = 64
export const SEGMENTS = 5
export const PARTS = HAIRS * SEGMENTS + 8
export const FIELD = [40, 24, 12] as const
export const FIELDS = {
  res: 'vec2f',
  aspect: 'f32',
  time: 'f32',
  dt: 'f32',
  fluidDt: 'f32',
  breeze: 'f32',
  focus: 'f32',
  light: 'f32',
  head: 'vec4f',
  breath: 'vec4f',
  impulse: 'vec4f',
} as const

const common = (uniform: string) => /* wgsl */ `
${uniform}
${RANDOM}
@group(0) @binding(0) var<uniform> u: Dandelion;
struct Seed {
  pos: vec4f,
  vel: vec4f,
  axis: vec4f,
  angular: vec4f,
}
struct Root { direction: vec4f, release: vec4f }
fn project(p: vec3f) -> vec3f {
  let scale = 1.0 / max(0.5, 1.0 + p.z * 0.22);
  return vec3f(p.x * scale / u.aspect, p.y * scale, clamp(0.4 + p.z * 0.07, 0.01, 0.99));
}
fn headPosition() -> vec3f { return u.head.xyz; }
fn sunPosition() -> vec2f { return vec2f(u.aspect * 0.66, 0.58); }
`

const fieldCommon = /* wgsl */ `
const DIMS = vec3u(${FIELD[0]}u, ${FIELD[1]}u, ${FIELD[2]}u);
const CELLS = ${FIELD[0] * FIELD[1] * FIELD[2]}u;
const ORIGIN = vec3f(-4.0, -1.6, -2.0);
const EXTENT = vec3f(8.0, 4.0, 6.0);
const SPACING = EXTENT / vec3f(DIMS);
fn cellIndex(c: vec3u) -> u32 { return (c.z * DIMS.y + c.y) * DIMS.x + c.x; }
fn cellCoord(i: u32) -> vec3u { return vec3u(i % DIMS.x, (i / DIMS.x) % DIMS.y, i / (DIMS.x * DIMS.y)); }
fn inside(c: vec3i) -> bool { return all(c >= vec3i(0)) && all(c < vec3i(DIMS)); }
`

// 速度はセルの正側の面に置く。発散と圧力勾配に同じ差分を使い、射影後に発散が残るのを避ける。
const sampleVelocity = (buffer: string) => /* wgsl */ `
fn faceValue(c: vec3i, component: u32) -> f32 {
  let bounded = vec3u(clamp(c, vec3i(0), vec3i(DIMS) - 1));
  if (c[component] < 0 || c[component] >= i32(DIMS[component]) - 1) { return 0.0; }
  return ${buffer}[cellIndex(bounded)][component];
}
fn air(p: vec3f) -> vec3f {
  var velocity = vec3f(0.0);
  for (var component = 0u; component < 3u; component++) {
    var offset = vec3f(0.0);
    offset[component] = 0.5;
    let grid = clamp((p - ORIGIN) / SPACING - 0.5 - offset, vec3f(-1.0), vec3f(DIMS));
    let c = vec3i(floor(grid));
    let f = fract(grid);
    for (var z = 0; z < 2; z++) {
      for (var y = 0; y < 2; y++) {
        for (var x = 0; x < 2; x++) {
          let w = mix(vec3f(1.0) - f, f, vec3f(f32(x), f32(y), f32(z)));
          velocity[component] += faceValue(c + vec3i(x, y, z), component) * w.x * w.y * w.z;
        }
      }
    }
  }
  return velocity;
}
`

export const advect = (uniform: string) => /* wgsl */ `
${common(uniform)}
${fieldCommon}
@group(0) @binding(1) var<storage, read> velocitySource: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> advected: array<vec4f>;
${sampleVelocity('velocitySource')}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= CELLS) { return; }
  let c = cellCoord(i);
  let center = ORIGIN + (vec3f(c) + 0.5) * SPACING;
  var velocity = vec3f(0.0);
  for (var component = 0u; component < 3u; component++) {
    var p = center;
    p[component] += 0.5 * SPACING[component];
    // 中点から逆にたどる semi-Lagrangian 移流。入力をやめても、吹いた流れが運ばれて残る。
    let midpoint = p - air(p) * u.fluidDt * 0.5;
    let transported = air(p - air(midpoint) * u.fluidDt)[component];
    let delta = (p - vec3f(u.breath.xy, 0.0)) / vec3f(0.25, 0.25, 0.42);
    let jet = exp(-dot(delta, delta) * 0.5) * u.breath.z;
    // 未操作の見本だけに加える外力。毎フレーム場を上書きせず、同じ流体へ弱く入れる。
    let curl = vec3f(
      0.55 * cos(p.y * 1.1) - 0.4 * cos(p.z * 1.3),
      0.45 * cos(p.z * 1.2) - 0.55 * cos(p.x * 1.1),
      0.4 * cos(p.x * 1.3) - 0.45 * cos(p.y * 1.2)
    );
    let ambient = (vec3f(0.17, 0.045, 0.0) + curl * 0.095) * u.breeze;
    let driven = transported + (u.impulse[component] - transported) * (1.0 - exp(-jet * 42.0 * u.fluidDt));
    velocity[component] = driven * exp(-0.18 * u.fluidDt) + ambient[component] * 0.7 * u.fluidDt;
    if (c[component] == DIMS[component] - 1u) { velocity[component] = 0.0; }
  }
  advected[i] = vec4f(velocity, 0.0);
}
`

export const divergence = /* wgsl */ `
${fieldCommon}
@group(0) @binding(0) var<storage, read> velocitySource: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> divergenceField: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= CELLS) { return; }
  let c = cellCoord(i);
  var value = 0.0;
  for (var axis = 0u; axis < 3u; axis++) {
    var neighbor = c;
    var lower = 0.0;
    if (c[axis] > 0u) {
      neighbor[axis] -= 1u;
      lower = velocitySource[cellIndex(neighbor)][axis];
    }
    value += (velocitySource[i][axis] - lower) / SPACING[axis];
  }
  divergenceField[i] = value;
}
`

export const jacobi = /* wgsl */ `
${fieldCommon}
@group(0) @binding(0) var<storage, read> divergenceField: array<f32>;
@group(0) @binding(1) var<storage, read> pressureSource: array<f32>;
@group(0) @binding(2) var<storage, read_write> pressureTarget: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= CELLS) { return; }
  let c = vec3i(cellCoord(i));
  var total = 0.0;
  var weight = 0.0;
  for (var axis = 0u; axis < 3u; axis++) {
    let coefficient = 1.0 / (SPACING[axis] * SPACING[axis]);
    for (var side = -1; side <= 1; side += 2) {
      var neighbor = c;
      neighbor[axis] += side;
      // 境界を通る流れはゼロ。外側の圧力は隣のセルと等しい Neumann 境界にする。
      if (inside(neighbor)) {
        total += pressureSource[cellIndex(vec3u(neighbor))] * coefficient;
        weight += coefficient;
      }
    }
  }
  pressureTarget[i] = (total - divergenceField[i]) / weight;
}
`

export const projectWind = /* wgsl */ `
${fieldCommon}
@group(0) @binding(0) var<storage, read> advected: array<vec4f>;
@group(0) @binding(1) var<storage, read> pressure: array<f32>;
@group(0) @binding(2) var<storage, read_write> field: array<vec4f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= CELLS) { return; }
  let c = cellCoord(i);
  var velocity = advected[i].xyz;
  for (var axis = 0u; axis < 3u; axis++) {
    var neighbor = c;
    if (c[axis] < DIMS[axis] - 1u) {
      neighbor[axis] += 1u;
      velocity[axis] -= (pressure[cellIndex(neighbor)] - pressure[i]) / SPACING[axis];
    } else { velocity[axis] = 0.0; }
  }
  field[i] = vec4f(velocity, 0.0);
}
`

export const simulate = (uniform: string) => /* wgsl */ `
${common(uniform)}
${fieldCommon}
@group(0) @binding(1) var<storage, read> source: array<Seed>;
@group(0) @binding(2) var<storage, read_write> nextSeeds: array<Seed>;
@group(0) @binding(3) var<storage, read> roots: array<Root>;
@group(0) @binding(4) var<storage, read> field: array<vec4f>;
${sampleVelocity('field')}
${flightWGSL}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= 72u) { return; }
  var s = source[i];
  let r = roots[i];
  if (r.release.w < 0.5) { s.vel = vec4f(0.0); }
  if (s.vel.w < 0.5) {
    s.pos = vec4f(headPosition() + r.direction.xyz * 0.265, 0.0);
    s.axis = vec4f(r.direction.xyz, s.axis.w);
    if (r.release.w > 0.5) {
      s.vel = vec4f(limitedVelocity(seedAir(air(s.pos.xyz)), ${FLIGHT.initial}), 1.0);
      // 放射状の付着姿勢を引き継がず、見本と同じく傘が上の姿で離れる。
      s.axis = vec4f(normalize(vec3f(r.direction.x * 0.3, 1.0, r.direction.z * 0.3)), s.axis.w);
      s.angular = vec4f(0.0);
    }
  }
  if (s.vel.w > 0.5 && s.vel.w < 1.5) {
    let dt = u.dt;
    let traits = rand3(i * 389u + 71u);
    let phase = traits.x * 6.283185;
    let relative = seedAir(air(s.pos.xyz)) - s.vel.xyz;
    let axial = s.axis.xyz * dot(relative, s.axis.xyz);
    let force = (relative - axial) * 1.8 + axial * 4.6;
    s.vel = vec4f(limitedVelocity(s.vel.xyz + (force + vec3f(0.0, -0.22, 0.0)) * dt, ${FLIGHT.seed}), 1.0);
    s.pos = vec4f(s.pos.xyz + s.vel.xyz * dt, s.pos.w + dt);
    // 復元先にも個体差と遅い揺れを残し、全員が直立するのを避ける。
    let lean = (traits.y - 0.5) * 0.66 + sin(u.time * (0.6 + traits.z * 0.35) + phase) * 0.15;
    let desired = normalize(vec3f(tan(lean) - relative.x * 0.45, 1.0, (traits.z - 0.5) * 0.48 + cos(u.time * 0.49 + phase) * 0.12));
    let torque = cross(s.axis.xyz, desired) * 5.5;
    let angular = (s.angular.xyz + torque * dt) * exp(-2.8 * dt);
    s.angular = vec4f(angular, 0.0);
    let spin = select(-1.0, 1.0, traits.x > 0.5) * (0.12 + traits.z * 0.22);
    s.axis = vec4f(normalize(s.axis.xyz + cross(angular, s.axis.xyz) * dt), s.axis.w + dt * spin);
    if (s.pos.w >= r.direction.w) { s.vel.w = 2.0; }
  }
  nextSeeds[i] = s;
}
`

export const seeds = (uniform: string) => /* wgsl */ `
${common(uniform)}
@group(0) @binding(1) var<storage, read> items: array<Seed>;
struct Out {
  @builtin(position) position: vec4f,
  @location(0) across: f32,
  @location(1) alpha: f32,
  @location(2) color: vec3f,
}
fn strand(t: f32, axis: vec3f, radial: vec3f, length: f32, phase: f32) -> vec3f {
  let sag = 0.026 * t * t - 0.012 * sin(t * 3.14159);
  return radial * (t * length) + axis * sag + axis * sin(phase + t * 4.0) * 0.0018 * t;
}
fn attachedStrand(t: f32, axis: vec3f, tipDirection: vec3f, tipRadius: f32) -> vec3f {
  let stemRadius = 0.265;
  let straight = mix(axis * stemRadius, tipDirection * tipRadius, t);
  let outward = tipDirection * mix(stemRadius, tipRadius, t);
  // 球面に毛先を置くだけでは接線向きの傘が縁に並ぶ。外側の2区間は放射方向にそろえる。
  return headPosition() + mix(straight, outward, smoothstep(0.0, 0.6, t));
}
fn vertex(v: u32, instance: u32, hair: bool) -> Out {
  let i = instance / ${PARTS}u;
  let part = instance % ${PARTS}u;
  let s = items[i];
  let flying = s.vel.w > 0.5;
  let axis = normalize(s.axis.xyz);
  let helper = select(vec3f(0.0, 0.0, 1.0), vec3f(1.0, 0.0, 0.0), abs(axis.z) > 0.9);
  let side = normalize(cross(axis, helper));
  let other = cross(axis, side);
  let scale = select(1.0, 0.85, flying);
  var center = s.pos.xyz;
  var a: vec3f;
  var b: vec3f;
  var thickness: f32;
  var opacity: f32;
  var color: vec3f;
  let isHair = part < ${HAIRS * SEGMENTS}u;
  if (isHair) {
    let h = part / ${SEGMENTS}u;
    let seg = part % ${SEGMENTS}u;
    let localAngle = f32(h) * 6.283185 / ${HAIRS}.0 + (rand(i * 191u + h) - 0.5) * 0.065;
    let angle = localAngle + s.axis.w;
    let radial = side * cos(angle) + other * sin(angle);
    // 傘を少し楕円にし、長い側を回転させて左右の毛の重なりを変える。
    let length = 0.075 * (0.82 + rand(i * 97u + h) * 0.33) * (1.0 + 0.14 * cos(localAngle) - 0.10 * sin(localAngle) * sin(localAngle));
    let phase = s.axis.w + f32(h) * 0.7;
    a = center + strand(f32(seg) / ${SEGMENTS}.0, axis, radial, length, phase) * scale;
    b = center + strand(f32(seg + 1u) / ${SEGMENTS}.0, axis, radial, length, phase) * scale;
    if (!flying) {
      let tipRadius = 0.302 + (rand(i * 97u + h) - 0.5) * 0.024;
      let tipDirection = normalize(axis * 0.265 + radial * length * (0.8 + rand(i * 313u + h) * 0.4));
      a = attachedStrand(f32(seg) / ${SEGMENTS}.0, axis, tipDirection, tipRadius);
      b = attachedStrand(f32(seg + 1u) / ${SEGMENTS}.0, axis, tipDirection, tipRadius);
    }
    thickness = 0.00068 * (1.0 - f32(seg) * 0.11) * scale;
    opacity = (0.16 + 0.14 * rand(h + i * 13u)) * u.light;
    if (!flying) {
      // 毛束ごとの濃淡と外側の欠けを作り、球面上に光る輪がつながるのを避ける。
      let tuft = rand(i * 557u + 43u);
      let gap = rand(i * 127u + h * 19u);
      opacity *= select(0.65 + tuft * 0.3, 0.24 + tuft * 0.22, seg == 0u) * select(1.0, 0.12 + gap * 0.32, seg >= 3u && gap < 0.42);
    }
    color = vec3f(1.0, 0.94, 0.77);
  } else {
    let seg = part - ${HAIRS * SEGMENTS}u;
    if (seg < 4u) {
      let t = f32(seg) / 4.0;
      a = center - axis * (0.19 * t) * scale;
      b = center - axis * (0.19 * (t + 0.25)) * scale;
      thickness = 0.00105 * scale;
      color = vec3f(0.62, 0.53, 0.32);
      opacity = 0.72;
    } else {
      let t = f32(seg - 4u) / 4.0;
      a = center - axis * (0.19 + 0.033 * t) * scale;
      b = center - axis * (0.19 + 0.033 * (t + 0.25)) * scale;
      thickness = (0.0015 + 0.0030 * sin((t + 0.125) * 3.14159)) * scale;
      color = mix(vec3f(0.22, 0.16, 0.075), vec3f(0.53, 0.39, 0.19), rand(i));
      opacity = 0.95;
    }
  }
  if (!flying && !isHair) {
    opacity *= 0.26 + rand(i * 211u + 31u) * 0.18;
  }
  let pa = project(a);
  let pb = project(b);
  let delta = (pb.xy - pa.xy) * vec2f(u.aspect, 1.0);
  let normal = normalize(vec2f(-delta.y, delta.x) + vec2f(0.000001));
  let defocus = max(0.0, abs(center.z) - 0.30);
  let blur = defocus * u.focus * select(1.0, 1.75, center.z < 0.0);
  let rawWidth = thickness * u.res.y * 0.5 / (1.0 + center.z * 0.22);
  let width = max(0.7, rawWidth) + blur;
  let corners = array<vec2f, 6>(vec2f(0.0,-1.0), vec2f(1.0,-1.0), vec2f(0.0,1.0), vec2f(0.0,1.0), vec2f(1.0,-1.0), vec2f(1.0,1.0));
  let q = corners[v];
  let ndc = mix(pa, pb, q.x);
  var o: Out;
  o.position = vec4f(ndc.xy + normal / vec2f(u.aspect, 1.0) * q.y * width * 2.0 / u.res.y, ndc.z, 1.0);
  let fade = select(u.head.w, (1.0 - smoothstep(13.0, 17.0, s.pos.w)) * u.head.w, flying);
  let distanceFade = 1.0 - smoothstep(0.4, 2.5, center.z) * 0.48;
  o.alpha = opacity * min(1.0, rawWidth / width) * fade * distanceFade;
  if (s.vel.w > 1.5 || isHair != hair) { o.alpha = 0.0; }
  o.across = q.y;
  o.color = color;
  return o;
}
@vertex fn vsHair(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out { return vertex(v, i, true); }
@vertex fn vsBody(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out { return vertex(v, i, false); }
@fragment fn fs(o: Out) -> @location(0) vec4f {
  let coverage = exp(-o.across * o.across * 3.2) * (1.0 - smoothstep(0.7, 1.0, abs(o.across)));
  return vec4f(o.color, o.alpha * coverage);
}
`

export const landscape = (uniform: string) => /* wgsl */ `
${common(uniform)}
${FULLSCREEN}
fn hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn noise(p: vec2f) -> f32 {
  let c = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(c), hash(c + vec2f(1.0, 0.0)), w.x), mix(hash(c + vec2f(0.0, 1.0)), hash(c + 1.0), w.x), w.y);
}
@fragment fn fs(o: FullOut) -> @location(0) vec4f {
  let p = vec2f((o.uv.x * 2.0 - 1.0) * u.aspect, 1.0 - o.uv.y * 2.0);
  let n = noise(p * vec2f(1.5, 2.4)) * 0.65 + noise(p * 4.7 + 8.0) * 0.35;
  let horizon = 0.48 + noise(vec2f(p.x * 1.4, 2.0)) * 0.22;
  let meadow = 1.0 - smoothstep(horizon - 0.22, horizon + 0.3, p.y);
  let sky = mix(vec3f(0.75, 0.79, 0.72), vec3f(0.90, 0.86, 0.68), exp(-length(p - vec2f(1.4, 0.7)) * 0.65));
  let green = mix(vec3f(0.16, 0.23, 0.12), vec3f(0.40, 0.45, 0.23), n);
  var color = mix(sky, green, meadow);
  // 太い草の像をぼかして重ね、点状の玉ぼけを作らない。
  for (var i = 0u; i < 30u; i++) {
    let r = rand3(i * 173u + 91u);
    let height = 0.4 + r.y * 1.05;
    let t = clamp((p.y + 1.12) / height, 0.0, 1.0);
    let x = (r.x * 2.0 - 1.0) * (u.aspect + 0.5) + sin(t * 1.8 + r.z * 6.0) * t * 0.2;
    let width = 0.025 + r.z * 0.07;
    let mask = exp(-pow((p.x - x) / width, 2.0) * 0.5) * (1.0 - smoothstep(0.5, 1.0, t));
    color = mix(color, mix(vec3f(0.13,0.20,0.10), vec3f(0.50,0.52,0.28), r.z), mask * 0.22);
  }
  let sunDelta = p - sunPosition();
  let sunDistance = dot(sunDelta, sunDelta);
  let haze = exp(-sunDistance * 1.6);
  let glow = exp(-sunDistance * 11.0);
  let softCore = exp(-sunDistance * 55.0);
  color = mix(color, vec3f(1.0, 0.81, 0.49), haze * 0.22 * u.light);
  color += (vec3f(0.13, 0.085, 0.032) * glow + vec3f(0.11, 0.092, 0.058) * softCore) * u.light;
  return vec4f(color, 1.0);
}
`

export const scene = (uniform: string) => /* wgsl */ `
${common(uniform)}
${FULLSCREEN}
@group(0) @binding(1) var backdrop: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;
@fragment fn fs(o: FullOut) -> @location(0) vec4f {
  var color = textureSample(backdrop, linearSampler, o.uv).rgb;
  let p = vec2f((o.uv.x * 2.0 - 1.0) * u.aspect, 1.0 - o.uv.y * 2.0);
  let head = headPosition().xy;
  let t = clamp((p.y + 1.15) / (head.y + 1.15), 0.0, 1.0);
  let x = head.x + 0.105 * (1.0 - t) * (1.0 - t);
  let stemDist = abs(p.x - x);
  let aa = 2.0 / u.res.y;
  let stem = (1.0 - smoothstep(0.007 - aa, 0.007 + aa, stemDist)) * (1.0 - smoothstep(head.y - 0.01, head.y + 0.015, p.y));
  var stemColor = mix(vec3f(0.18,0.25,0.065), vec3f(0.49,0.54,0.19), smoothstep(-0.006,0.006,p.x - x));
  let rimWidth = max(0.0012, aa * 0.6);
  let rim = exp(-pow((p.x - x - 0.0058) / rimWidth, 2.0));
  stemColor = mix(stemColor, vec3f(0.94, 0.77, 0.39), rim * 0.68 * u.light);
  color = mix(color, stemColor, stem * u.head.w);
  let q = (p - head) / vec2f(0.055, 0.060);
  let r = length(q);
  let core = 1.0 - smoothstep(0.90,1.02,r);
  let coreColor = mix(vec3f(0.24,0.21,0.10), vec3f(0.56,0.53,0.30), clamp(0.45 + q.x * 0.4 + q.y * 0.2,0.0,1.0));
  color = mix(color, coreColor, core * u.head.w);
  let vignette = 1.0 - 0.08 * dot(o.uv - 0.5, o.uv - 0.5);
  return vec4f(color * vignette, 1.0);
}
`
