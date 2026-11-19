import { CELLS, LIVE_ROWS, ROWS } from './automaton'
import { SHAPE, START_SIZE } from './geometry'

export const SHELL_FIELDS = {
  viewProj: 'mat4x4f',
  lightProj: 'mat4x4f',
  eye: 'vec3f',
  growth: 'f32',
  wetness: 'f32',
  historyOffset: 'f32',
  historyFull: 'u32',
} as const

const geometry = /* wgsl */ `
${SHAPE}
struct Surface {
  @builtin(position) position: vec4f,
  @location(0) world: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) @interpolate(flat) layer: u32,
  @location(4) shadow: vec4f,
}
fn surfacePoint(param: vec3f) -> vec3f {
  let size = min(${START_SIZE} + param.x * ${1 - START_SIZE}, shell.growth);
  if (param.z < 0.5) { return shape(size, param.y); }
  let p = shape(shell.growth, param.y);
  let dv = shape(shell.growth, param.y + 0.0001) - shape(shell.growth, param.y - 0.0001);
  let dt = shape(shell.growth + 0.0001, param.y) - shape(shell.growth - 0.0001, param.y);
  let n = normalize(cross(dt, dv));
  // 半円断面の薄い唇。殻口をふさぐ板は置かない。
  let thickness = 0.012 * shell.growth;
  return p - n * thickness * (1.0 - cos(param.x * 3.14159265))
    + normalize(dt) * thickness * sin(param.x * 3.14159265);
}
fn surface(param: vec3f) -> Surface {
  let p = surfacePoint(param);
  let dv = surfacePoint(param + vec3f(0.0, 0.0001, 0.0)) - surfacePoint(param - vec3f(0.0, 0.0001, 0.0));
  // 成長端で座標をclampする前の接線を取り、最後の列でも法線を消さない。
  let size = ${START_SIZE} + min(param.x, (shell.growth - ${START_SIZE}) / ${1 - START_SIZE}) * ${1 - START_SIZE};
  var dt = shape(size + 0.0001, param.y) - shape(size - 0.0001, param.y);
  if (param.z > 0.5) {
    dt = surfacePoint(param + vec3f(0.0001, 0.0, 0.0)) - surfacePoint(param - vec3f(0.0001, 0.0, 0.0));
  }
  var o: Surface;
  o.position = shell.viewProj * vec4f(p, 1.0);
  o.world = p;
  o.normal = normalize(cross(dt, dv));
  let deposited = (size - ${START_SIZE}) / ${1 - START_SIZE};
  let historyRow = select(deposited, (shell.growth - ${START_SIZE}) / ${1 - START_SIZE}, param.z > 0.5);
  o.uv = vec2f((param.y * ${CELLS - 1}.0 + 0.5) / ${CELLS}.0, (historyRow * ${ROWS - 1}.0 + 0.5) / ${ROWS}.0);
  o.layer = u32(param.z);
  o.shadow = shell.lightProj * vec4f(p, 1.0);
  return o;
}
@vertex fn vs(@location(0) param: vec3f) -> Surface { return surface(param); }
@vertex fn vsShadow(@location(0) param: vec3f) -> @builtin(position) vec4f {
  return surface(param).shadow;
}
`

export const shadowShader = (uniform: string) => /* wgsl */ `
${uniform}
@group(0) @binding(0) var<uniform> shell: Shell;
${geometry}
`

export const shellShader = (uniform: string) => /* wgsl */ `
${uniform}
@group(0) @binding(0) var<uniform> shell: Shell;
@group(0) @binding(1) var pigment: texture_2d<f32>;
@group(0) @binding(2) var pigmentSampler: sampler;
@group(0) @binding(3) var shadowMap: texture_depth_2d;
@group(0) @binding(4) var shadowSampler: sampler_comparison;
${geometry}

fn visibility(p: vec4f, n: vec3f) -> f32 {
  let q = p.xyz / p.w;
  let uv = vec2f(q.x * 0.5 + 0.5, 0.5 - q.y * 0.5);
  let bias = 0.0009 + 0.0018 * (1.0 - max(0.0, dot(n, normalize(vec3f(-4.0, 5.0, 2.0)))));
  var total = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      total += textureSampleCompareLevel(shadowMap, shadowSampler, uv + vec2f(f32(x), f32(y)) / 1024.0, q.z - bias);
    }
  }
  return total / 9.0;
}

// 縦長の面光源の映り込みを一つだけ置く。細い方向と広い方向を別々に測る。
fn stripReflection(n: vec3f, v: vec3f, light: vec3f, width: f32) -> f32 {
  let reflected = reflect(-v, n);
  let across = normalize(cross(light, vec3f(0.0, 1.0, 0.0)));
  let lengthwise = normalize(cross(across, light));
  let narrow = dot(reflected, across) / width;
  let broad = dot(reflected, lengthwise) / 0.72;
  return exp(-narrow * narrow - broad * broad) * smoothstep(0.2, 0.9, dot(reflected, light));
}

@fragment fn fs(o: Surface, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  let view = normalize(shell.eye - o.world);
  let n = select(-normalize(o.normal), normalize(o.normal), front);
  let light = normalize(vec3f(-4.0, 5.0, 2.0));
  let lit = visibility(o.shadow, n);
  // 先端の縮小段が未生成の行を混ぜないよう、生成済みの最後の行までに制限する。
  let latest = (shell.growth - ${START_SIZE}) / ${1 - START_SIZE};
  var pigmentRow = min(o.uv.y * ${ROWS}.0 - 0.5, floor(latest * ${ROWS - 1}.0));
  if (shell.historyFull == 1u && pigmentRow >= ${ROWS - LIVE_ROWS}.0) {
    pigmentRow = ${ROWS - LIVE_ROWS}.0 + (pigmentRow - ${ROWS - LIVE_ROWS}.0 + shell.historyOffset) % ${LIVE_ROWS}.0;
  }
  let uv = vec2f(o.uv.x, (pigmentRow + 0.5) / ${ROWS}.0);
  let pattern = textureSampleGrad(pigment, pigmentSampler, uv, dpdx(o.uv), dpdy(o.uv)).rgb;
  let bandWidth = 0.018 * shell.growth / ${1 - START_SIZE};
  let fresh = (1.0 - smoothstep(0.0, bandWidth, latest - o.uv.y)) * shell.wetness;
  let cream = vec3f(0.72, 0.66, 0.51);
  // 線形RGB。表示時に焦げ茶#4A2A16前後となる地から、抑制の残量で黄土へ変わる。
  let ground = mix(vec3f(0.068, 0.023, 0.008), vec3f(0.26, 0.12, 0.028), 0.2 + 0.7 * pattern.g);
  var albedo = mix(ground, cream, pattern.r);
  albedo *= 1.0 + fresh * 0.08;
  if (!front) { albedo = vec3f(0.045, 0.016, 0.007); }
  if (o.layer == 1u) { albedo = mix(albedo, cream, 0.5); }
  let sideFill = max(dot(n, normalize(vec3f(4.0, 0.0, 3.0))), 0.0);
  let diffuse = 0.19 + 0.78 * smoothstep(-0.15, 1.0, dot(n, light)) * mix(0.35, 1.0, lit) + sideFill * 0.07;
  let fresnel = 0.035 + 0.16 * pow(1.0 - max(dot(n, view), 0.0), 5.0);
  let reflection = stripReflection(n, view, light, mix(0.30, 0.27, fresh)) * mix(0.10, 0.14, fresh) * mix(0.4, 1.0, lit);
  let sheen = select(0.08, 1.0, front);
  let transmission = pow(max(0.0, dot(-n, light)), 3.0) * select(0.0, 0.055, o.layer == 1u);
  var color = albedo * diffuse + vec3f(0.96, 0.89, 0.74) * reflection * sheen;
  color += vec3f(0.1, 0.083, 0.06) * fresnel * sheen + cream * transmission;
  color += cream * select(0.0, 0.055, o.layer == 1u);
  return vec4f(pow(max(color, vec3f(0.0)), vec3f(1.0 / 2.2)), 1.0);
}
`
