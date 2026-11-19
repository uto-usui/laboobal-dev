/** 捕食魚だけは厚みのあるメッシュを描く。水の霞はイワシと同じ式にする。 */
export const hunterDraw = (schoolStruct: string) => /* wgsl */ `
${schoolStruct}
@group(0) @binding(0) var<uniform> F: School;
struct Out {
  @builtin(position) pos: vec4f,
  @location(0) local: vec3f,
  @location(1) normal: vec3f,
  @location(2) world: vec3f,
  @location(3) kind: f32,
  @location(4) membrane: vec2f,
}
fn deform(p: vec3f) -> vec3f {
  let rear = clamp((1.0 - p.x) / 4.7, 0.0, 1.0);
  let wave = sin(F.predatorPhase + p.x * 1.15) * rear * rear * 0.52;
  // 旋回の曲率で中心線を弧にし、尾の波を重ねる。
  return vec3f(p.xy, p.z + F.predatorBend * p.x * p.x * 0.5 + wave);
}
@vertex fn vs(@location(0) p: vec3f, @location(1) normal: vec3f, @location(2) kind: f32,
  @location(3) membrane: vec2f, @location(4) flap: f32) -> Out {
  var o: Out;
  let forward = normalize(F.predatorDir);
  let reference = select(vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0), abs(forward.y) > 0.98);
  let up = normalize(reference - forward * dot(reference, forward));
  let side = normalize(cross(forward, up));
  let bank = clamp(F.predatorBend * 3.0, -0.45, 0.45);
  let dorsal = up * cos(bank) + side * sin(bank);
  let lateral = side * cos(bank) - up * sin(bank);
  let basis = mat3x3f(forward, dorsal, lateral);
  var q = deform(p);
  q.y += sin(F.predatorPhase * 0.5) * abs(flap) * 0.085;
  q.z += cos(F.predatorPhase * 0.5) * flap * 0.035;
  // 解析的な微分で法線を補正し、頂点ごとの変形の再計算を省く。
  let rear = clamp((1.0 - p.x) / 4.7, 0.0, 1.0);
  let rearSlope = select(0.0, -1.0 / 4.7, p.x > -3.7 && p.x < 1.0);
  let phase = F.predatorPhase + p.x * 1.15;
  let slope = F.predatorBend * p.x + 0.52 * (cos(phase) * 1.15 * rear * rear + sin(phase) * 2.0 * rear * rearSlope);
  let bentNormal = vec3f(normal.x - slope * normal.z, normal.yz);
  o.world = F.predatorPos + basis * q;
  o.pos = F.viewProj * vec4f(o.world, 1.0);
  o.normal = normalize(basis * bentNormal);
  o.local = p;
  o.kind = kind;
  o.membrane = membrane;
  return o;
}
@fragment fn fs(in: Out, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  let p = in.local;
  var normal = normalize(in.normal);
  if (in.kind > 0.5 && !front) { normal = -normal; }
  let view = normalize(F.eye - in.world);
  let light = normalize(vec3f(-0.3, 0.85, -0.4));
  let back = vec3f(0.025, 0.095, 0.16);
  let belly = vec3f(0.72, 0.8, 0.83);
  var c = mix(belly, back, smoothstep(-0.42, 0.52, p.y));
  let flank = exp(-pow((p.y + 0.04) / 0.28, 2.0));
  c = mix(c, vec3f(0.34, 0.53, 0.62), flank * 0.48);
  let line = exp(-pow((p.y - 0.07) / 0.035, 2.0)) * smoothstep(-2.5, -1.7, p.x) * (1.0 - smoothstep(1.7, 2.5, p.x));
  c += vec3f(0.18, 0.22, 0.15) * line;
  // 下腹の短い縞とえら。平面の絵に戻らないよう、体の法線で照らす。
  let stripes = pow(max(0.0, sin(p.x * 10.0 + p.y * 2.0)), 12.0) * (1.0 - smoothstep(-0.5, -0.1, p.y)) * (1.0 - smoothstep(0.8, 1.6, p.x));
  c *= 1.0 - stripes * 0.16;
  let gill = exp(-pow((p.x - 1.9 + p.y * p.y * 0.45) / 0.045, 2.0)) * (1.0 - smoothstep(0.45, 0.75, abs(p.y)));
  c *= 1.0 - gill * 0.5;
  let rayCoordinate = select(in.membrane.y * 8.0, in.membrane.x * 6.0, in.kind > 2.5);
  let rayWidth = max(fwidth(rayCoordinate), 0.025);
  var opacity = 1.0;
  if (in.kind > 0.5) {
    let tail = in.kind > 2.5;
    let span = select(in.membrane.x, in.membrane.y, tail);
    // 根元は胴の色を受け、薄い先端には水面の透過光を足す。
    c = mix(c, vec3f(0.39, 0.58, 0.64), smoothstep(0.0, 1.0, span) * 0.7);
    let rayDistance = abs(fract(rayCoordinate + 0.5) - 0.5);
    let ray = 1.0 - smoothstep(0.018, 0.018 + rayWidth, rayDistance);
    let rayStrength = ray * smoothstep(0.02, 0.16, span) * (1.0 - smoothstep(0.8, 1.0, span));
    c += vec3f(0.11, 0.16, 0.17) * rayStrength;
    opacity = mix(1.0, 0.18, smoothstep(0.05, 1.0, span)) + rayStrength * 0.12;
    c += vec3f(0.12, 0.19, 0.21) * pow(1.0 - abs(dot(normal, light)), 2.0) * span;
  }
  c *= 0.55 + max(0.0, dot(normal, light)) * 0.45;
  let reflected = reflect(-view, normal);
  let silver = pow(max(0.0, reflected.y), 6.0);
  c += vec3f(0.55, 0.69, 0.76) * silver * (0.15 + flank * 0.55);
  let spec = pow(max(0.0, dot(normal, normalize(light + view))), 65.0);
  c += vec3f(0.7, 0.84, 0.9) * spec * 0.65;
  let eyeDistance = length((p.xy - vec2f(2.65, 0.16)) / vec2f(0.15, 0.14));
  if (in.kind < 0.5 && abs(p.z) > 0.12) {
    let eye = 1.0 - smoothstep(0.68, 1.0, eyeDistance);
    c = mix(c, vec3f(0.52, 0.63, 0.63), eye);
    c = mix(c, vec3f(0.007, 0.016, 0.025), 1.0 - smoothstep(0.35, 0.58, eyeDistance));
  }
  let waterColor = mix(vec3f(0.122, 0.373, 0.541), vec3f(0.020, 0.086, 0.165), smoothstep(0.38, 1.0, in.pos.y / F.res.y));
  let haze = exp(-length(in.world - F.eye) * F.haze);
  return vec4f(mix(waterColor, c, haze), opacity);
}
`

/** CPU が見る 256 匹だけを詰め、群れ全体の読み戻しを避ける。 */
export const hunterObserve = (schoolStruct: string) => /* wgsl */ `
${schoolStruct}
@group(0) @binding(0) var<uniform> F: School;
@group(0) @binding(1) var<storage, read> fish: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> samples: array<vec4f>;
@compute @workgroup_size(256) fn main(@builtin(local_invocation_id) id: vec3u) {
  let source = (id.x * F.n / 256u) * 3u;
  let base = id.x * 3u;
  samples[base] = fish[source];
  samples[base + 1u] = fish[source + 1u];
  samples[base + 2u] = fish[source + 2u];
}
`
