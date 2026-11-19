import { FULLSCREEN, RANDOM } from '../../shared/gpu/wgsl'
import { STRUCTS } from './physics'
import { PROJECTION_WGSL } from './projection'
import { SNOW_RENDER_WGSL } from './snow-render'

export const TUBE_STEPS = 12
export const TUBE_LENGTH_STEPS = 4
export const NEEDLE_STEPS = 6

export const renderShader = (uniform: string) => /* wgsl */ `
${uniform}
${STRUCTS}
${RANDOM}
${FULLSCREEN}
struct Needle { ids: vec4f, shape: vec4f }
@group(0) @binding(0) var<uniform> u: Bough;
@group(0) @binding(1) var<storage, read> points: array<Point>;
@group(0) @binding(2) var<storage, read> segments: array<vec4u>;
@group(0) @binding(3) var<storage, read> needles: array<Needle>;
@group(0) @binding(4) var<storage, read> snows: array<Snow>;
struct Powder { center: vec4f, spread: vec4f }
@group(0) @binding(5) var<storage, read> powders: array<Powder>;
@group(1) @binding(0) var shadowMap: texture_depth_2d;
@group(1) @binding(1) var shadowSampler: sampler_comparison;

struct Surface {
  @builtin(position) position: vec4f,
  @location(0) world: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) @interpolate(flat) material: u32,

}
const LIGHT = vec3f(-0.42107596, 0.7218445, 0.5499778);
const RIGHT = vec3f(0.794, 0.0, 0.608);
const UP = vec3f(-0.439, -0.692, 0.573);
fn at(i: u32) -> vec3f { return mix(points[i].previous.xyz, points[i].p.xyz, u.interpolation); }
${PROJECTION_WGSL}
fn lightProject(p: vec3f) -> vec4f {
  return vec4f(dot(p, RIGHT) / 9.0, dot(p, UP) / 7.0, 0.5 - dot(p, LIGHT) / 30.0, 1.0);
}
fn surface(p: vec3f, n: vec3f, uv: vec2f, material: u32) -> Surface {
  var o: Surface;
  o.position = project(p); o.world = p; o.normal = n; o.uv = uv; o.material = material;
  return o;
}
fn corner(i: u32) -> vec2f {
  let corners = array<vec2f, 6>(vec2f(0,0), vec2f(1,0), vec2f(0,1), vec2f(0,1), vec2f(1,0), vec2f(1,1));
  return corners[i % 6u];
}
fn branch(vi: u32, instance: u32) -> Surface {
  let seg = segments[instance];
  let a = points[seg.x]; let b = points[seg.y];
  let uv = corner(vi);
  let ring = vi / 6u;
  let angle = (f32(ring % ${TUBE_STEPS}u) + uv.x) / ${TUBE_STEPS}.0 * 6.2831853;
  let t = (f32(ring / ${TUBE_STEPS}u) + uv.y) / ${TUBE_LENGTH_STEPS}.0;
  let neighborsA = vec2u(seg.w & 255u, (seg.w >> 8u) & 255u);
  let neighborsB = vec2u((seg.w >> 16u) & 255u, (seg.w >> 24u) & 255u);
  var tangentA = normalize(at(neighborsA.y)-at(neighborsA.x));
  if (seg.x == 0u) { tangentA = normalize(points[seg.y].rest.xyz-points[seg.x].rest.xyz); }
  let tangentB = normalize(at(neighborsB.y)-at(neighborsB.x));
  let span = distance(at(seg.x),at(seg.y));
  // 物理の節点を増やさず、管だけを Hermite 補間して滑らかにつなぐ。
  let center = (2.0*t*t*t-3.0*t*t+1.0)*at(seg.x) + (t*t*t-2.0*t*t+t)*span*tangentA
    + (-2.0*t*t*t+3.0*t*t)*at(seg.y) + (t*t*t-t*t)*span*tangentB;
  let tangent = normalize(mix(tangentA,tangentB,t));
  let director = normalize(mix(a.director.xyz,b.director.xyz,t));
  let side = normalize(director-tangent*dot(director,tangent));
  let depth = normalize(cross(tangent, side));
  let n = cos(angle) * side + sin(angle) * depth;
  let radius = mix(a.previous.w, b.previous.w, t);
  let p = center + n * radius;
  return surface(p, n, vec2f((f32(seg.x) + t) * 0.13, angle), 0u);
}
fn needle(vi: u32, instance: u32) -> Surface {
  let item = needles[instance];
  let a = at(u32(item.ids.x));
  let b = at(u32(item.ids.y));
  let tangent = normalize(b - a);
  let side = normalize(points[u32(item.ids.x)].director.xyz);
  let direction = normalize(tangent * cos(item.shape.y) + side * sin(item.shape.y) + normalize(cross(tangent,side))*item.shape.w);
  let across = normalize(cross(direction, vec3f(0,0,1)));
  let uv = corner(vi);
  let t = (f32(vi / 6u) + uv.y) / ${NEEDLE_STEPS}.0;
  let width = ((1.0 - t * t) * 0.011 + 0.0007) * item.ids.z;
  let bend = vec3f(0,-0.055 - item.ids.w * 0.06,0.035);
  let p = mix(a,b,item.shape.z) + direction * item.shape.x * t + bend * t * t + across * (uv.x - 0.5) * width;
  let n = normalize(vec3f(0,0,1) + across * (uv.x - 0.5) * 1.5);
  return surface(p, n, vec2f(uv.x, t), 2u);
}
@vertex fn vsBranch(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Surface { return branch(v,i); }
@vertex fn vsNeedle(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Surface { return needle(v,i); }
@vertex fn vsBranchShadow(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> @builtin(position) vec4f { return lightProject(branch(v,i).world); }
@vertex fn vsNeedleShadow(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> @builtin(position) vec4f { return lightProject(needle(v,i).world); }

fn hash(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(127.1,311.7,74.7))) * 43758.5453); }
fn noise(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let s = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i),hash(i+vec3f(1,0,0)),s.x),mix(hash(i+vec3f(0,1,0)),hash(i+vec3f(1,1,0)),s.x),s.y),
    mix(mix(hash(i+vec3f(0,0,1)),hash(i+vec3f(1,0,1)),s.x),mix(hash(i+vec3f(0,1,1)),hash(i+vec3f(1,1,1)),s.x),s.y),s.z);
}
fn shadow(p: vec3f, n: vec3f) -> f32 {
  let light = lightProject(p + n * 0.012);
  let uv = vec2f(light.x * 0.5 + 0.5, 0.5 - light.y * 0.5);
  var sum = 0.0;
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    sum += textureSampleCompare(shadowMap, shadowSampler, uv + vec2f(f32(x),f32(y)) * 0.0012, light.z - 0.0005);
  } }
  return sum / 9.0;
}
@fragment fn fs(in: Surface) -> @location(0) vec4f {
  var n = normalize(in.normal);
  let diffuse = max(dot(n, LIGHT), 0.0);
  let visibility = shadow(in.world, n);
  var color: vec3f;
  if (in.material == 0u) {
    let bark = noise(vec3f(in.uv.x * 6.0, in.uv.y * 5.0, 0.2));
    let grain = sin(in.uv.x * 34.0 + bark * 5.0) * 0.5 + 0.5;
    let base = mix(vec3f(0.12,0.13,0.105), vec3f(0.28,0.24,0.18), bark * 0.7 + grain * 0.15);
    color = base * (0.44 + diffuse * visibility * 0.75) + mix(vec3f(0.025,0.045,0.07),vec3f(0.04,0.045,0.035),visibility);
  } else {
    let line = 1.0 - abs(in.uv.x * 2.0 - 1.0);
    let tip = smoothstep(0.55, 1.0, in.uv.y);
    color = mix(vec3f(0.035,0.095,0.068),vec3f(0.12,0.205,0.115),line * 0.28 + tip * 0.47 + diffuse * 0.18)
      * (0.72 + visibility * 0.28);
  }
  color *= u.brightness;
  return vec4f(clamp(color,vec3f(0),vec3f(1)),1);
}
${SNOW_RENDER_WGSL}
@fragment fn forest(in: FullOut) -> @location(0) vec4f {
  let uv = in.uv;
  let world = vec2f((uv.x * 2.0 - 1.0) * u.view.z, (1.0 - uv.y * 2.0) * u.view.w + u.view.y);
  let cloud = noise(vec3f(world * 0.19, 1.5));
  var color = mix(vec3f(0.80,0.845,0.87), vec3f(0.91,0.93,0.94), cloud);
  // 遠景から重ねる。距離で幹の太さ、ぼけ、霧と雪面の高さを変える。
  for (var layer = 0u; layer < 3u; layer++) {
    let depth = f32(layer) / 2.0;
    let snowline = -1.8 - depth * 1.5 + noise(vec3f(world.x * (0.16 + depth * 0.08),0,f32(layer))) * 0.65;
    let ground = 1.0 - smoothstep(snowline - 0.28, snowline + 0.4, world.y);
    color = mix(color, mix(vec3f(0.88,0.91,0.93),vec3f(0.81,0.86,0.89),depth), ground * 0.65);
    for (var i = 0u; i < 7u + layer * 2u; i++) {
      let random = rand3(i + 317u + layer * 113u);
      // 正弦ハッシュを軸ごとに使い、等間隔や同じ傾きの並びを作らない。
      let seed = vec3f(f32(i) * 13.17, f32(layer) * 31.7, 9.3);
      let placement = hash(seed);
      let breadth = hash(seed + vec3f(17,3,41));
      let density = hash(seed + vec3f(5,29,7));
      let x = (placement * 2.0 - 1.0) * 15.0 + world.y * (breadth - 0.5) * 0.17 + sin(world.y * 0.37 + placement * 9.0) * 0.08;
      let width = mix(0.035,0.16,depth) * (0.35 + breadth * 2.2);
      let blur = mix(0.43,0.13,depth) + density * 0.24;
      let trunk = 1.0 - smoothstep(width, width + blur, abs(world.x - x));
      let tree = mix(vec3f(0.76,0.81,0.835),vec3f(0.43,0.53,0.55),depth);
      let aboveGround = smoothstep(snowline - 0.1, snowline + 0.55, world.y);
      color = mix(color, tree, trunk * mix(0.12,0.46,depth) * (0.3 + density * 0.7) * aboveGround);
      // 先細りの枝を幹から左右へ出し、同じ幅の縦帯だけにしない。
      for (var limb = 0u; limb < 3u; limb++) {
        let side = select(-1.0,1.0,(i + limb) % 2u == 0u);
        let reach = (world.x - x) * side;
        let level = -0.2 + f32(limb) * 1.65 + random.z;
        let ridge = abs(world.y - level - reach * 0.36);
        let taper = 1.0 - smoothstep(0.2,1.25 + depth,reach);
        let limbMask = (1.0 - smoothstep(0.015,blur * 0.85,ridge)) * taper * smoothstep(-0.2,0.15,reach);
        color = mix(color, tree, limbMask * 0.19 * aboveGround);
      }
    }
  }
  let vignette = smoothstep(0.25, 1.4, length((uv - 0.5) * vec2f(1.0,0.8)));
  return vec4f(color * (1.0 - vignette * 0.07) * u.brightness,1);
}
`
