import { FULLSCREEN, RANDOM } from '../../shared/gpu/wgsl'
import {
  BRANCH_NECK,
  BRANCH_ROOT,
  BRANCH_SEGMENTS,
  BRANCH_SIDES,
  BRANCH_TIP,
  BUD_SEGMENTS,
  SHAFT_SEGMENTS,
} from './simulation'

export const FIELDS = {
  viewProj: 'mat4x4f',
  lightProj: 'mat4x4f',
  aspect: 'f32',
  branch: 'f32',
  light: 'f32',
  leafCount: 'f32',
} as const

export const ROWS = 72
export const COLUMNS = 24
export const LEAF_VERTICES = ROWS * COLUMNS * 6
export const STEM_VERTICES = 24 * 8 * 6
export const BRANCH_VERTICES = BRANCH_SEGMENTS * BRANCH_SIDES * 6

export const shaders = (uniform: string) => /* wgsl */ `
${uniform}
${RANDOM}
${FULLSCREEN}
struct Leaf {
  pivot: vec4f,
  axisX: vec4f,
  axisY: vec4f,
  axisZ: vec4f,
  color: vec4f,
  detail: vec4f,
  contact: vec4f,
  shape: vec4f,
}
@group(0) @binding(0) var<uniform> scene: Aspen;
@group(0) @binding(1) var<storage, read> leaves: array<Leaf>;
@group(1) @binding(0) var shadowMap: texture_depth_2d;
@group(1) @binding(1) var shadowSampler: sampler_comparison;
@group(2) @binding(0) var forestMap: texture_2d<f32>;
@group(2) @binding(1) var forestSampler: sampler;

fn noise(p: vec2f) -> f32 {
  let cell = vec2i(floor(p));
  let f = fract(p);
  let s = f * f * (3.0 - 2.0 * f);
  let seed = bitcast<u32>(cell.x) * 1597u + bitcast<u32>(cell.y) * 5171u;
  return mix(mix(rand(seed), rand(seed + 1597u), s.x),
    mix(rand(seed + 5171u), rand(seed + 6768u), s.x), s.y);
}

fn displayColor(c: vec3f) -> vec3f {
  return pow(vec3f(1.0) - exp(-max(c, vec3f(0.0)) * scene.light), vec3f(1.0 / 2.2));
}

fn bokehLight(p: vec2f) -> vec3f {
  var c = vec3f(0.0);
  // 四つの大きな絞り像。外周を少し残し、色のにじみだけの背景にしない。
  let lights = array<vec3f, 4>(vec3f(-0.54, -0.3, 0.105), vec3f(0.08, -0.34, 0.135),
    vec3f(0.51, 0.06, 0.092), vec3f(-0.1, 0.29, 0.075));
  for (var i = 0u; i < 4u; i++) {
    let disk = lights[i];
    let d = length((p - disk.xy) * vec2f(1.0, 1.07));
    let blur = 0.025 + f32(i % 2u) * 0.012;
    let aperture = 1.0 - smoothstep(disk.z - blur, disk.z + blur, d);
    let halo = exp(-pow(d / (disk.z * 1.6), 2.0)) * 0.14;
    c += vec3f(0.95, 0.67, 0.25) * (aperture * 0.58 + halo);
  }
  return c;
}

fn transmittedLight(uv: vec2f) -> f32 {
  let p = (uv - 0.5) * vec2f(scene.aspect, 1.0);
  let skyGap = exp(-pow((p.x + 0.07 + p.y * 0.15) / 0.24, 2.0)) *
    (0.3 + 0.7 * (1.0 - smoothstep(-0.45, 0.35, p.y)));
  let distantGap = exp(-pow((p.x - 0.63 + p.y * 0.2) / 0.17, 2.0));
  // 林の細かな明暗は葉に写さず、空の抜けと背景と同じ玉ぼけだけを光源にする。
  return 0.04 + 0.34 * skyGap + 0.12 * distantGap +
    dot(bokehLight(p), vec3f(0.2126, 0.7152, 0.0722));
}

fn forest(uv: vec2f) -> vec3f {
  // 画面の高さを1とする。林の大きな面、幹、空の抜けを別々の奥行きとして重ねる。
  let p = (uv - 0.5) * vec2f(scene.aspect, 1.0);
  let canopy = noise(p * vec2f(3.4, 4.0) + vec2f(8.3, 2.7));
  let foliage = noise(p * vec2f(7.0, 5.0) + vec2f(1.1, 4.8));
  var c = mix(vec3f(0.045, 0.072, 0.035), vec3f(0.32, 0.19, 0.035), canopy);
  c += vec3f(0.15, 0.1, 0.025) * foliage;
  let skyGap = exp(-pow((p.x + 0.07 + p.y * 0.15) / 0.24, 2.0)) *
    (0.3 + 0.7 * (1.0 - smoothstep(-0.45, 0.35, p.y)));
  let distantGap = exp(-pow((p.x - 0.63 + p.y * 0.2) / 0.17, 2.0));
  c = mix(c, vec3f(0.94, 0.77, 0.39), skyGap * 0.72);
  c += vec3f(0.38, 0.29, 0.13) * distantGap;
  let trunks = array<vec4f, 6>(
    vec4f(-0.69, 0.026, 0.042, 0.68), vec4f(-0.4, -0.04, 0.066, 0.84),
    vec4f(-0.16, 0.018, 0.027, 0.46), vec4f(0.34, -0.026, 0.048, 0.68),
    vec4f(0.73, 0.04, 0.034, 0.64), vec4f(0.95, -0.02, 0.075, 0.75));
  for (var i = 0u; i < 6u; i++) {
    let trunk = trunks[i];
    let d = (p.x - trunk.x - p.y * trunk.y) / trunk.z;
    let blur = exp(-d * d * 0.5);
    let barkColor = mix(vec3f(0.035, 0.039, 0.023), vec3f(0.15, 0.125, 0.065),
      smoothstep(-0.5, 1.0, d));
    c = mix(c, barkColor, blur * trunk.w);
  }
  c += bokehLight(p);
  let sun = exp(-dot((p - vec2f(-0.2, -0.45)) / vec2f(0.5, 0.38),
    (p - vec2f(-0.2, -0.45)) / vec2f(0.5, 0.38)));
  c += vec3f(0.3, 0.19, 0.065) * sun;
  let vignette = 1.0 - 0.2 * dot(p / vec2f(max(scene.aspect, 1.0), 1.0), p);
  return c * vignette;
}

@fragment fn bakeForest(o: FullOut) -> @location(0) vec4f {
  return vec4f(forest(o.uv), 1.0);
}
@fragment fn background(o: FullOut) -> @location(0) vec4f {
  return vec4f(displayColor(textureSample(forestMap, forestSampler, o.uv).rgb), 1.0);
}

struct Surface {
  @builtin(position) pos: vec4f,
  @location(0) world: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) @interpolate(flat) leafId: u32,
  @location(4) @interpolate(flat) material: u32,
}

fn corner(vertex: u32) -> vec2f {
  let corners = array<vec2f, 6>(vec2f(0, 0), vec2f(0, 1), vec2f(1, 0),
    vec2f(1, 0), vec2f(0, 1), vec2f(1, 1));
  return corners[vertex % 6u];
}

fn outline(t: f32, shape: vec4f) -> f32 {
  let roundness = pow(max(sin(t * 3.14159265), 0.0), shape.x);
  return 0.5 * roundness * (1.13 - shape.y * t);
}

fn leafLocal(s: f32, t: f32, leaf: Leaf) -> vec3f {
  let tooth = 1.0 + 0.008 * sin(t * 191.0 + leaf.detail.x);
  let x = s * outline(t, leaf.shape) * leaf.axisX.w * tooth;
  let cup = 0.105 * s * s * sin(t * 3.14159265);
  let bend = leaf.axisZ.w * t * t;
  let ridge = 0.025 * (1.0 - abs(s)) * sin(t * 3.14159265);
  return vec3f(x, -leaf.pivot.w - t * leaf.axisY.w,
    leaf.detail.y + cup + bend + ridge + 0.022 * s * t);
}

fn leafWorld(p: vec3f, leaf: Leaf) -> vec3f {
  return leaf.pivot.xyz + leaf.axisX.xyz * p.x + leaf.axisY.xyz * p.y + leaf.axisZ.xyz * p.z;
}

fn makeLeaf(vertex: u32, id: u32) -> Surface {
  let leaf = leaves[id];
  let cell = vertex / 6u;
  let c = corner(vertex);
  let s = (f32(cell % ${COLUMNS}u) + c.x) / ${COLUMNS}.0 * 2.0 - 1.0;
  let t = (f32(cell / ${COLUMNS}u) + c.y) / ${ROWS}.0;
  let p = leafLocal(s, t, leaf);
  // 端の退化した三角形で法線が壊れないよう、微分の評価点を少し内側に置く。
  let safeT = clamp(t, 0.002, 0.998);
  let dx = leafLocal(s + 0.001, safeT, leaf) - leafLocal(s - 0.001, safeT, leaf);
  let dt = leafLocal(s, safeT + 0.001, leaf) - leafLocal(s, safeT - 0.001, leaf);
  let n = normalize(cross(dt, dx));
  var o: Surface;
  o.world = leafWorld(p, leaf);
  o.normal = normalize(leaf.axisX.xyz * n.x + leaf.axisY.xyz * n.y + leaf.axisZ.xyz * n.z);
  o.uv = vec2f(p.x / leaf.axisX.w, t);
  o.leafId = id;
  o.material = 0u;
  o.pos = scene.viewProj * vec4f(o.world, 1);
  return o;
}

fn rotateBranch(p: vec3f) -> vec3f {
  let root = vec2f(5.6, 0.72 + 5.6 * 0.34 + 0.055 * sin(5.6 * 1.7) + 0.022 * sin(5.6 * 4.1));
  let d = p.xy - root;
  let a = scene.branch;
  return vec3f(root + vec2f(cos(a) * d.x - sin(a) * d.y, sin(a) * d.x + cos(a) * d.y), p.z);
}

fn branchCenter(x: f32) -> vec3f {
  return vec3f(x, 0.72 + 0.34 * x + 0.055 * sin(x * 1.7) + 0.022 * sin(x * 4.1), -0.12);
}

fn branchRadius(x: f32) -> f32 {
  if (x < ${BRANCH_NECK}) {
    let t = clamp((x - ${BRANCH_TIP}) / (${BRANCH_NECK} - ${BRANCH_TIP}), 0.0, 1.0);
    return 0.02 * t * t * (3.0 - 2.0 * t) + 0.033 * pow(sin(3.14159265 * t), 2.0);
  }
  let t = clamp((x - ${BRANCH_NECK}) / (${BRANCH_ROOT} - ${BRANCH_NECK}), 0.0, 1.0);
  return 0.02 + 0.09 * pow(t, 1.25);
}

fn branchSurface(x: f32, a: f32) -> vec3f {
  var radius = branchRadius(x);
  // 葉の付く節だけ膨らませる。影も同じ立体から作る。
  for (var i = 0u; i < u32(scene.leafCount); i++) {
    let d = (x - leaves[i].detail.z) / 0.09;
    radius *= 1.0 + 0.28 * exp(-d * d);
  }
  radius *= 1.0 + 0.045 * sin(x * 27.0 + a * 3.0);
  let slope = 0.34 + 0.0935 * cos(x * 1.7) + 0.0902 * cos(x * 4.1);
  let across = normalize(vec3f(-slope, 1.0, 0.0));
  // 断面の二軸を直交させ、曲がりで管の太さが変わらないようにする。
  return branchCenter(x) + radius * (across * cos(a) + vec3f(0, 0, sin(a)));
}

fn makeBranch(vertex: u32) -> Surface {
  let cell = vertex / 6u;
  let c = corner(vertex);
  let segment = f32(cell / ${BRANCH_SIDES}u) + c.y;
  var x = mix(${BRANCH_NECK}, ${BRANCH_ROOT}, (segment - ${BUD_SEGMENTS}.0) / ${SHAFT_SEGMENTS}.0);
  if (segment <= ${BUD_SEGMENTS}.0) {
    x = mix(${BRANCH_TIP}, ${BRANCH_NECK}, segment / ${BUD_SEGMENTS}.0);
  }
  // 同じ環の頂点と継ぎ目の角度を一致させ、芽まで一続きの面を張る。
  let side = f32(cell % ${BRANCH_SIDES}u) + c.x;
  let a = side / ${BRANCH_SIDES}.0 * 6.2831853;
  let ringAngle = (side % ${BRANCH_SIDES}.0) / ${BRANCH_SIDES}.0 * 6.2831853;
  let p = branchSurface(x, ringAngle);
  let along = branchSurface(x + 0.001, ringAngle) - branchSurface(x - 0.001, ringAngle);
  // 周方向は単位接線で求め、半径0の先端でも法線を失わないようにする。
  let slope = 0.34 + 0.0935 * cos(x * 1.7) + 0.0902 * cos(x * 4.1);
  let across = normalize(vec3f(-slope, 1.0, 0.0));
  let around = -across * sin(ringAngle) + vec3f(0, 0, cos(ringAngle));
  let n = normalize(cross(around, along));
  var o: Surface;
  o.world = rotateBranch(p);
  o.normal = normalize(vec3f(cos(scene.branch) * n.x - sin(scene.branch) * n.y,
    sin(scene.branch) * n.x + cos(scene.branch) * n.y, n.z));
  o.uv = vec2f((x - ${BRANCH_TIP}) / (${BRANCH_ROOT} - ${BRANCH_TIP}), a);
  o.leafId = 0u;
  o.material = select(1u, 3u, x < ${BRANCH_NECK});
  o.pos = scene.viewProj * vec4f(o.world, 1);
  return o;
}

fn makeStem(vertex: u32, id: u32) -> Surface {
  let leaf = leaves[id];
  let cell = vertex / 6u;
  let c = corner(vertex);
  let t = (f32(cell / 8u) + c.y) / 24.0;
  let a = (f32(cell % 8u) + c.x) / 8.0 * 6.2831853;
  let r = mix(0.014, 0.008, t);

  // 最初の接線を枝の外へ固定し、二つ目の制御点も接触面の外へ置く。
  let end = -leaf.axisY.xyz * leaf.pivot.w + leaf.axisZ.xyz * leaf.detail.y;
  let first = leaf.contact.xyz * leaf.pivot.w * 0.35;
  var second = end * 0.72 + leaf.axisX.xyz * leaf.pivot.w * 0.13 * leaf.detail.w;
  second += leaf.contact.xyz * max(0.0, 0.08 - dot(second, leaf.contact.xyz));
  let u = 1.0 - t;
  let center = leaf.pivot.xyz + 3.0 * u * u * t * first + 3.0 * u * t * t * second + t * t * t * end;
  let tangent = normalize(3.0 * u * u * first + 6.0 * u * t * (second - first) + 3.0 * t * t * (end - second));
  let across = normalize(leaf.axisX.xyz - tangent * dot(leaf.axisX.xyz, tangent));
  let n = across * cos(a) + normalize(cross(tangent, across)) * sin(a);
  var o: Surface;
  o.world = center + n * r;
  o.normal = n;
  o.uv = vec2f(t, a);
  o.leafId = id;
  o.material = 2u;
  o.pos = scene.viewProj * vec4f(o.world, 1);
  return o;
}

@vertex fn vsLeaf(@builtin(vertex_index) v: u32, @builtin(instance_index) id: u32) -> Surface {
  return makeLeaf(v, id);
}
@vertex fn vsBranch(@builtin(vertex_index) v: u32) -> Surface { return makeBranch(v); }
@vertex fn vsStem(@builtin(vertex_index) v: u32, @builtin(instance_index) id: u32) -> Surface {
  return makeStem(v, id);
}
@vertex fn shadowLeaf(@builtin(vertex_index) v: u32, @builtin(instance_index) id: u32) -> @builtin(position) vec4f {
  return scene.lightProj * vec4f(makeLeaf(v, id).world, 1);
}
@vertex fn shadowBranch(@builtin(vertex_index) v: u32) -> @builtin(position) vec4f {
  return scene.lightProj * vec4f(makeBranch(v).world, 1);
}
@vertex fn shadowStem(@builtin(vertex_index) v: u32, @builtin(instance_index) id: u32) -> @builtin(position) vec4f {
  return scene.lightProj * vec4f(makeStem(v, id).world, 1);
}

fn visibility(p: vec3f) -> f32 {
  let clip = scene.lightProj * vec4f(p, 1);
  let projected = clip.xyz / clip.w;
  let uv = projected.xy * vec2f(0.5, -0.5) + 0.5;
  var sum = 0.0;
  // 幅のある光源として、影の境界を九点でならす。
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      sum += textureSampleCompare(shadowMap, shadowSampler,
        uv + vec2f(f32(x), f32(y)) * 0.006, projected.z - 0.0018);
    }
  }
  return mix(1.0, sum / 9.0, select(0.0, 1.0,
    all(uv >= vec2f(0)) && all(uv <= vec2f(1)) && projected.z < 1.0));
}

fn midrib(t: f32, seed: f32) -> f32 {
  return 0.009 * sin(t * 5.0 + seed) * sin(t * 3.14159265);
}

fn veins(uv: vec2f, seed: f32, footprint: f32, shape: vec4f) -> f32 {
  // 脈の太さは葉の座標で決め、画素幅は消え際のアンチエイリアスだけに使う。
  let mainWidth = mix(0.006, 0.0012, uv.y);
  var relief = (1.0 - smoothstep(mainWidth * 0.35, mainWidth + footprint,
    abs(uv.x - midrib(uv.y, seed)))) * (1.0 - smoothstep(0.88, 1.0, uv.y));
  for (var i = 0; i < 5; i++) {
    for (var side = -1; side <= 1; side += 2) {
      let variation = sin(seed * 1.7 + f32(i) * 4.9 + f32(side) * 1.3);
      let rootT = 0.1 + f32(i) * 0.148 + variation * 0.014;
      let reach = outline(min(0.96, rootT + 0.24), shape) * (0.89 + variation * 0.035);
      let along = (uv.x - midrib(rootT, seed)) * f32(side) / reach;
      let u = clamp(along, 0.0, 1.0);
      let rise = 0.19 + variation * 0.025;
      let curveT = rootT + rise * u + 0.055 * u * u;
      let slope = (rise + 0.11 * u) / reach;
      let separation = abs(uv.y - curveT) / sqrt(1.0 + slope * slope);
      let width = mix(0.0033, 0.00055, u) * (1.0 - f32(i) * 0.06);
      let ends = smoothstep(-0.025, 0.025, along) * (1.0 - smoothstep(0.82, 1.0, along));
      relief = max(relief, (1.0 - smoothstep(width * 0.3, width + footprint, separation)) * ends * 0.74);
    }
  }
  return relief;
}

@fragment fn surface(o: Surface, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  let lightDirection = normalize(vec3f(-3.0, 7.0, -10.0) - o.world);
  let geometricNormal = normalize(select(-o.normal, o.normal, front));
  let lit = visibility(o.world);
  let leaf = leaves[o.leafId];
  let uv = o.uv;
  let footprint = max(length(fwidth(uv)) * 0.45, 0.0001);
  // 一枚の中で半周期以下のうねりに抑え、局所的な斑点を作らない。
  let across = abs(uv.x) / max(outline(uv.y, leaf.shape), 0.01);
  let center = (1.0 - smoothstep(0.1, 1.0, across)) * sin(uv.y * 3.14159265);
  let tissue = sin(uv.x * 1.8 + uv.y * 1.2 + leaf.detail.x) * 0.008;
  let vein = veins(uv, leaf.detail.x, footprint, leaf.shape);
  // 縁からの黄変と葉脈沿いに残る緑を、大きくなめらかな色の差にする。
  let green = (center * 0.32 + sqrt(vein) * 0.5) * leaf.shape.z;
  let autumn = mix(leaf.color.xyz, vec3f(0.20, 0.43, 0.025), green);
  let margin = smoothstep(0.3, 0.92, across) * (0.38 + leaf.shape.w * 0.28);
  let pigment = mix(autumn, vec3f(0.68, 0.22, 0.02), margin) *
    (0.88 + 0.12 * center) * (1.0 + tissue);
  // 葉脈を法線から外し、浮き出た線ではなく厚みの差として透かす。
  let n = geometricNormal;
  let edgeDistance = min(outline(uv.y, leaf.shape) - abs(uv.x), min(uv.y, 1.0 - uv.y) * 0.55);
  let edge = 1.0 - smoothstep(0.002, 0.012 + footprint, edgeDistance);
  // 正射影で背景と座標をそろえ、縦長でも横長でも光る場所を一致させる。
  let clip = scene.viewProj * vec4f(o.world, 1.0);
  let screenUV = clip.xy / clip.w * vec2f(0.5, -0.5) + 0.5;
  let incident = transmittedLight(screenUV);
  let bright = smoothstep(0.08, 0.65, incident);
  // 玉ぼけの光は広い角度から届くとみなし、葉が傾いても透過を失わせない。
  let thickness = leaf.color.w * (0.72 + 0.1 * (1.0 - center) + vein * 0.9) *
    (1.0 + edge * 0.18) / mix(0.78, 1.0, abs(dot(n, lightDirection)));
  let transmittedPigment = mix(pigment, vec3f(0.95, 0.72, 0.065), bright * 0.12);
  let absorption = -log(max(transmittedPigment, vec3f(0.015)));
  // 葉脈の光学的な厚さを別に加え、明るい光の中でも暗い線を残す。
  let transmission = exp(-absorption * thickness - vec3f(vein * 0.95));
  let backLight = 0.75 + 0.25 * pow(max(dot(-n, lightDirection), 0.0), 0.65);
  let reflection = 0.08 + 0.06 * (n.y * 0.5 + 0.5) +
    0.16 * max(dot(n, lightDirection), 0.0) * lit;
  // 散乱光は影の中にも残す。影は暖かい褐色で、透過を完全には遮らない。
  let shadowTint = mix(vec3f(0.72, 0.62, 0.4), vec3f(1.0), lit);
  let through = transmission * vec3f(1.0, 0.98, 0.82) * backLight *
    (0.06 + 4.5 * pow(incident, 1.15)) * shadowTint;
  let halfVector = normalize(lightDirection + vec3f(0, 0, 1));
  let sheen = pow(max(dot(n, halfVector), 0.0), 22.0) * 0.025 * lit;
  var c = (pigment * reflection + through + vec3f(sheen)) * (1.0 - edge * 0.12);
  c = mix(c, c * vec3f(0.95, 1.1, 1.12), select(0.0, 0.3, !front));

  if (o.material != 0u) {
    let x = mix(${BRANCH_TIP}, ${BRANCH_ROOT}, uv.x);
    let bark = noise(vec2f(x * 3.1, uv.y * 1.4));
    let streak = noise(vec2f(x * 1.3, uv.y * 8.0));
    var brown = mix(vec3f(0.07, 0.032, 0.015), vec3f(0.25, 0.14, 0.063), bark);
    brown *= 0.8 + 0.3 * streak;
    let lenticel = pow(max(0.0, noise(vec2f(x * 32.0, uv.y * 3.0)) - 0.57) / 0.43, 2.0);
    brown += vec3f(0.16, 0.12, 0.07) * lenticel;
    for (var i = 0u; i < u32(scene.leafCount); i++) {
      let node = leaves[i].detail;
      let around = (uv.y - select(2.45, 0.7, node.w > 0.0)) / 0.6;
      let along = (x - node.z - 0.055) / 0.065;
      let scarDistance = sqrt(along * along + around * around);
      let scar = 1.0 - smoothstep(0.65, 1.1, scarDistance);
      let ring = exp(-pow((scarDistance - 1.05) / 0.22, 2.0));
      brown = mix(brown, vec3f(0.048, 0.022, 0.012), scar * 0.85);
      brown += vec3f(0.14, 0.075, 0.025) * ring;
    }
    let stemColor = mix(vec3f(0.23, 0.065, 0.02), vec3f(0.4, 0.19, 0.055), uv.x);
    let budColor = mix(vec3f(0.11, 0.028, 0.014), vec3f(0.3, 0.1, 0.035), bark);
    let woodColor = select(brown, budColor, o.material == 3u);
    let base = select(woodColor, stemColor, o.material == 2u);
    c = base * (0.45 + max(dot(geometricNormal, lightDirection), 0.0) * lit);
    c += base * pow(max(dot(-geometricNormal, lightDirection), 0.0), 2.0) * 0.35 * lit;
  }
  return vec4f(displayColor(c), 1.0);
}
`
