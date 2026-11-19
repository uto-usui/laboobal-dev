import { FULLSCREEN } from '../../shared/gpu/wgsl'
import { LEAF_DETAIL_PIXELS, LEAF_WIDTH, ROUND_SECONDS } from './tree'

export const TREE_FIELDS = {
  viewProj: 'mat4x4f',
  lightProj: 'mat4x4f',
  eye: 'vec3f',
  pixelHeight: 'f32',
  forward: 'vec3f',
  tangent: 'f32',
  right: 'vec3f',
  aspect: 'f32',
  up: 'vec3f',
  softness: 'f32',
  sun: 'vec3f',
  padding: 'f32',
} as const
export const OBJECT_FIELDS = {
  age: 'f32',
  opacity: 'f32',
  leafScale: 'f32',
  padding: 'f32',
  root: 'vec3f',
  modelScale: 'f32',
} as const

const color = /* wgsl */ `
fn displayColor(c: vec3f) -> vec3f {
  return pow(max(c / (vec3f(1.0) + c * 0.45), vec3f(0.0)), vec3f(1.0 / 2.2));
}
fn skyColor(ray: vec3f) -> vec3f {
  let elevation = smoothstep(-0.12, 0.8, ray.y);
  return mix(vec3f(0.64, 0.79, 0.62), vec3f(0.24, 0.51, 0.66), elevation);
}
`
export const sky = (uniform: string) => /* wgsl */ `
${uniform}
@group(0) @binding(0) var<uniform> scene: TreeScene;
${FULLSCREEN}
${color}
@fragment fn fsSky(input: FullOut) -> @location(0) vec4f {
  let p = input.uv * 2.0 - 1.0;
  let ray = normalize(scene.forward + scene.tangent * (scene.right * p.x * scene.aspect - scene.up * p.y));
  return vec4f(displayColor(skyColor(ray)), 1.0);
}
`

export const surface = (uniform: string, objectUniform: string) => /* wgsl */ `
${uniform}
${objectUniform}
@group(0) @binding(0) var<uniform> scene: TreeScene;
@group(0) @binding(1) var shadowDepth: texture_depth_2d;
@group(0) @binding(2) var shadowSampler: sampler_comparison;
@group(1) @binding(0) var<uniform> treeState: TreeObject;
${color}
struct SurfaceIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) detail: vec4f,
  @location(3) anchor: vec3f,
  @location(4) tint: vec3f,
}
struct SurfaceOut {
  @builtin(position) clip: vec4f,
  @location(0) world: vec3f,
  @location(1) normal: vec3f,
  @location(2) detail: vec4f,
  @location(3) fresh: f32,
  @location(4) tint: vec3f,
}
fn growthPosition(input: SurfaceIn) -> vec3f {
  let material = input.detail.w;
  if (material < 0.0) { return input.position; }
  let isLeaf = material > 0.5;
  let duration = select(0.52, 0.18, isLeaf);
  var growth = smoothstep(0.0, duration, treeState.age - input.detail.z);
  if (!isLeaf && input.detail.z < 0.01) { growth = 0.32 + growth * 0.68; }
  let distanceAlongView = max(1.0, dot(input.anchor - scene.eye, scene.forward));
  let leafPixels = ${LEAF_WIDTH} * treeState.leafScale * scene.pixelHeight / (2.0 * scene.tangent * distanceAlongView);
  // 小さな葉をばらまかず、遠景は葉先のある一続きの面へ切り替える。
  if ((material == 1.0 && leafPixels < ${LEAF_DETAIL_PIXELS}.0) || (material == 2.0 && leafPixels >= ${LEAF_DETAIL_PIXELS}.0)) { growth = 0.0; }
  let grown = mix(input.anchor, input.position, growth);
  return treeState.root + (grown - treeState.root) * treeState.modelScale;
}
@vertex fn vsShadow(input: SurfaceIn) -> @builtin(position) vec4f {
  return scene.lightProj * vec4f(growthPosition(input), 1.0);
}
@vertex fn vsSurface(input: SurfaceIn) -> SurfaceOut {
  var output: SurfaceOut;
  let p = growthPosition(input);
  output.clip = scene.viewProj * vec4f(p, 1.0);
  output.world = p;
  output.normal = input.normal;
  output.detail = input.detail;
  output.tint = input.tint;
  output.fresh = 1.0 - smoothstep(0.0, ${ROUND_SECONDS}, treeState.age - input.detail.z);
  return output;
}
fn sunlight(p: vec3f, normal: vec3f) -> f32 {
  let clip = scene.lightProj * vec4f(p + normal * 0.008, 1.0);
  let uv = clip.xy * vec2f(0.5, -0.5) + 0.5;
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0)) || clip.z < 0.0 || clip.z > 1.0) { return 1.0; }
  let texel = scene.softness / vec2f(textureDimensions(shadowDepth));
  var visibility = 0.0;
  for (var i = 0u; i < 4u; i++) {
    let offset = vec2f(select(-0.75, 0.75, (i & 1u) != 0u), select(-0.75, 0.75, (i & 2u) != 0u));
    visibility += textureSampleCompareLevel(shadowDepth, shadowSampler, uv + offset * texel, clip.z - 0.0004);
  }
  return visibility * 0.25;
}
@fragment fn fsSurface(input: SurfaceOut, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  let p = input.world;
  let material = input.detail.w;
  let isLeaf = material > 0.5;
  let isGround = material < 0.0;
  let n = normalize(input.normal) * select(-1.0, 1.0, front);
  let facing = max(dot(n, scene.sun), 0.0);
  let visibility = sunlight(p, n);
  var albedo = vec3f(0.22, 0.14, 0.065);
  if (isGround) {
    // 色の大きなうねりだけを使い、草や砂を粒で敷き詰めない。
    let meadowTone = 0.5 + 0.5 * sin(p.x * 0.75 + sin(p.z * 0.8)) * cos(p.z * 0.62);
    albedo = mix(vec3f(0.19, 0.25, 0.085), vec3f(0.31, 0.34, 0.13), meadowTone);
  } else if (isLeaf) {
    let edge = smoothstep(0.0, 1.0, abs(input.detail.x));
    albedo = mix(vec3f(0.055, 0.24, 0.035), vec3f(0.24, 0.43, 0.075), input.fresh);
    albedo *= mix(1.08, 0.84, edge);
    if (material < 3.0) {
      let leafAgeTone = mix(vec3f(0.92, 0.96, 1.08), vec3f(1.12, 1.04, 0.86), input.fresh);
      let exposureTone = mix(vec3f(0.9, 0.96, 1.06), vec3f(1.08, 1.03, 0.94), facing * visibility);
      albedo *= input.tint * leafAgeTone * exposureTone;
    }
    if (material == 3.0) { albedo *= 0.72; }
    if (material == 1.0) {
      let vein = 1.0 - smoothstep(0.015, 0.065, abs(input.detail.x));
      albedo += vec3f(0.035, 0.045, 0.005) * vein;
    }
  } else {
    albedo = mix(albedo, vec3f(0.32, 0.39, 0.12), input.fresh * 0.45);
  }
  let skyLight = mix(vec3f(0.17, 0.20, 0.09), vec3f(0.39, 0.49, 0.4), n.y * 0.5 + 0.5);
  var radiance = albedo * (skyLight + vec3f(1.35, 1.25, 0.85) * facing * visibility);
  if (isLeaf) {
    let transmission = pow(max(dot(-n, scene.sun), 0.0), 0.6);
    radiance += albedo * vec3f(0.55, 0.73, 0.22) * transmission * (0.35 + 0.65 * visibility);
  }
  let haze = 1.0 - exp(-pow(length(p - scene.eye) / 38.0, 3.0));
  radiance = mix(radiance, skyColor(normalize(p - scene.eye)), haze);
  return vec4f(displayColor(radiance), treeState.opacity);
}
`
