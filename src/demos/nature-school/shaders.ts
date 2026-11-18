import { FULLSCREEN, RANDOM } from '../../shared/gpu/wgsl'

/**
 * reaction: x 伝達の待ち時間、y きらめきの残り秒数、z 再反応までの秒数、w 次へ渡す強さ。
 * 1 匹: p.xyz 位置、p.w おびえ（0〜1）、v.xyz 速さ、v.w 傾き（-1〜1。曲がるときに体を傾ける量）。
 */
const FISH = /* wgsl */ `
struct Fish { p: vec4f, v: vec4f, reaction: vec4f }
`

/** 1 歩。近い 7 匹に合わせ、近すぎる相手から離れ、群れの空間に留まり、捕食魚から逃げる */
export const sim = (schoolStruct: string, gridDecl: string) => /* wgsl */ `
${schoolStruct}
${FISH}
${RANDOM}
@group(0) @binding(0) var<uniform> F: School;
@group(0) @binding(1) var<storage, read> src: array<Fish>;
@group(0) @binding(2) var<storage, read_write> dst: array<Fish>;
${gridDecl}

// 元の群れと同じく、近い 7 匹に反応を絞る
const NEAR = 7u;
// 密な所で 1 匹が見る相手の上限。これを超えたら残りは見ない（重さを抑える）
const MAX_SEEN = 256u;
// まわりの 27 升。自分の升、面で接する升、辺で接する升、角で接する升の順
const OFFSETS = array<vec3i, 27>(
  vec3i(0, 0, 0),
  vec3i(1, 0, 0), vec3i(-1, 0, 0), vec3i(0, 1, 0), vec3i(0, -1, 0), vec3i(0, 0, 1), vec3i(0, 0, -1),
  vec3i(1, 1, 0), vec3i(1, -1, 0), vec3i(-1, 1, 0), vec3i(-1, -1, 0),
  vec3i(1, 0, 1), vec3i(1, 0, -1), vec3i(-1, 0, 1), vec3i(-1, 0, -1),
  vec3i(0, 1, 1), vec3i(0, 1, -1), vec3i(0, -1, 1), vec3i(0, -1, -1),
  vec3i(1, 1, 1), vec3i(1, 1, -1), vec3i(1, -1, 1), vec3i(1, -1, -1),
  vec3i(-1, 1, 1), vec3i(-1, 1, -1), vec3i(-1, -1, 1), vec3i(-1, -1, -1));

/** 捕食魚からいちばん近い点。捕食魚の胴の前後を結ぶ線分として持つ */
fn predatorPoint(p: vec3f) -> vec3f {
  let ab = F.predatorB - F.predatorA;
  let t = clamp(dot(p - F.predatorA, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  return F.predatorA + ab * t;
}

@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= F.n) { return; }
  let me = src[i];
  let p = me.p.xyz;
  let v = me.v.xyz;
  let speed = length(v);
  let fwd = v / max(speed, 1e-4);

  var nd: array<f32, 7>;
  var nj: array<u32, 7>;
  for (var k = 0u; k < NEAR; k++) { nd[k] = F.perception * F.perception; nj[k] = i; }
  var sep = vec3f(0.0);
  var seen = 0u;
  let c0 = gridCell(p);
  // 自分の升から先に、近い升の順に回る。密な所で上限に届いても、見落とすのは遠い升の魚になり、向きが偏らない
  for (var o = 0u; o < 27u && seen < MAX_SEEN; o++) {
    let c = c0 + OFFSETS[o];
    if (!gridInside(c)) { continue; }
    var link = gridHead(c);
    while (link != 0u && seen < MAX_SEEN) {
      let j = link - 1u;
      link = gridLink(j);
      if (j == i) { continue; }
      let other = src[j];
      // 索引の衝突は近所として数えず、同じ物理的な升だけを見る。
      if (any(gridCell(other.p.xyz) != c)) { continue; }
      seen++;
      let d = other.p.xyz - p;
      let r2 = dot(d, d);
      if (r2 < F.sepRadius * F.sepRadius) {
        // 近いほど強く、半径の所で 0 になる押し返し
        let rr = sqrt(r2) + 1e-4;
        sep -= d / rr * (1.0 - rr / F.sepRadius);
      }
      if (r2 < nd[NEAR - 1u]) {
        var at = NEAR - 1u;
        while (at > 0u && nd[at - 1u] > r2) {
          nd[at] = nd[at - 1u];
          nj[at] = nj[at - 1u];
          at--;
        }
        nd[at] = r2;
        nj[at] = j;
      }
    }
  }

  var ali = vec3f(0.0);
  var coh = vec3f(0.0);
  var fearNear = 0.0;
  var m = 0.0;
  for (var k = 0u; k < NEAR; k++) {
    if (nj[k] == i) { break; }
    let o = src[nj[k]];
    ali += o.v.xyz;
    coh += o.p.xyz - p;
    // 発火直後の魚だけが渡す。残ったおびえを何度も送り合わない。
    if (o.reaction.y > 0.08) { fearNear = max(fearNear, o.reaction.w); }
    m += 1.0;
  }

  var stress = me.p.w;
  var acc = vec3f(0.0);
  if (m > 0.0) {
    // おびえている魚は、そろえる力と寄る力を強める。逃げる向きを伝えながら塊へ戻る
    let follow = F.ali * (1.0 + 2.0 * stress);
    acc += (ali / m - v) * follow + (coh / m) * F.coh * (1.0 + 3.0 * stress);
  }
  acc += sep * F.sep;

  // 楕円の空間の縁に近づいたら、真ん中へ向けて引き戻す。出たら強く引く。
  // どこでも真ん中へ引くばねにすると、全員が同じ周期で真ん中を通り、群れが 1 点に潰れる
  let q = (p - F.center) / F.radii;
  let ql = length(q);
  let gradient = q / F.radii;
  let inward = -gradient / max(length(gradient), 1e-5);
  acc += inward * (smoothstep(0.7, 1.0, ql) * 4.0 + max(0.0, ql - 1.0) * F.boundary);

  // 弱い潮の流れをゆっくり変え、群れが同じ所を回り続けないようにする
  let t = F.ambientTime;
  acc += F.current * vec3f(
    sin(p.z * 0.031 + t * 0.07) + 0.6 * sin(p.y * 0.07 - t * 0.043),
    0.35 * sin(p.x * 0.043 + t * 0.057),
    cos(p.x * 0.029 - t * 0.063) + 0.6 * cos(p.y * 0.05 + t * 0.037));

  // 捕食魚
  var fear = 0.0;
  if (F.predatorOn > 0.0) {
    let away = p - predatorPoint(p);
    let r = length(away);
    if (r < F.fearRadius) {
      fear = 1.0 - r / F.fearRadius;
      acc += away / max(r, 1e-3) * fear * fear * F.flee;
    }
  }
  // 水を叩いた場所から、一瞬だけ広い範囲を球状に押し返す。
  if (F.shockPower > 0.0) {
    let shockAway = p - F.shockPos;
    let shockDistance = length(shockAway);
    let shock = F.shockPower * (1.0 - smoothstep(0.0, F.shockRadius, shockDistance));
    acc += shockAway / max(shockDistance, 1e-3) * shock * F.flee * 2.5;
    fear = max(fear, shock);
  }

  var reaction = max(me.reaction - vec4f(0.0, F.dt, F.dt, 0.0), vec4f(0.0));
  let relayed = fearNear * F.relay;
  // 1 歩で次の魚へ渡さず、約 0.1 秒待ってから反応する。
  if (reaction.z <= 0.0 && relayed > 0.18) {
    reaction.x += F.dt;
  } else {
    reaction.x = 0.0;
  }
  let startled = reaction.z <= 0.0 &&
    ((fear > 0.18 && me.p.w < 0.18) || reaction.x >= 0.1);
  stress = max(stress - F.calm * F.dt, fear);
  if (startled) {
    stress = max(stress, relayed);
    // 待っている間の減衰で波がすぐ消えないよう、渡す強さは発火時に保持する。
    let signalStrength = select(relayed, max(fear, 0.85), fear > 0.18);
    reaction = vec4f(0.0, 0.28, 1.5, signalStrength);
  }

  let maxAcc = F.maxAcc * (1.0 + 1.5 * stress);
  let al = length(acc);
  if (al > maxAcc) { acc *= maxAcc / al; }

  var nv = v + acc * F.dt;
  let cruise = mix(F.vMin, F.vMax, 0.35 + 0.65 * stress);
  let ns = length(nv);
  nv = nv / max(ns, 1e-4) * clamp(mix(ns, cruise, 0.02), F.vMin, F.vMax * (1.0 + 0.3 * stress));

  // 曲がる向きに体を傾ける。横向きの加速を、右を正にした量にして、なめらかに追わせる
  let side = normalize(cross(fwd, vec3f(0.0, 1.0, 0.0)) + vec3f(1e-5, 0.0, 0.0));
  // 驚いた瞬間だけ横腹を返し、元の旋回に戻す。
  let startleTurn = sin(clamp(reaction.y / 0.28, 0.0, 1.0) * 3.141593);
  let bankTo = clamp(dot(acc, side) / F.maxAcc + startleTurn * 0.65, -1.0, 1.0);
  let bank = mix(me.v.w, bankTo, 1.0 - exp(-F.dt * 8.0));

  // 調整を極端にしたときも格子の内側に留める。ふつうは縁の力だけで戻る
  let lo = grid.origin + vec3f(0.6);
  let hi = grid.origin + vec3f(f32(grid.gx), f32(grid.gy), f32(grid.gz)) / grid.invCell - vec3f(0.6);
  let next = p + nv * F.dt;
  let outside = next != clamp(next, lo, hi);
  nv = select(nv, -nv, outside);
  dst[i] = Fish(vec4f(clamp(next, lo, hi), stress), vec4f(nv, bank), reaction);
}
`

/** 水面の明るみと、斜めに差す弱い光 */
export const water = (schoolStruct: string) => /* wgsl */ `
${schoolStruct}
${RANDOM}
${FULLSCREEN}
@group(0) @binding(0) var<uniform> F: School;

fn noise1(x: f32) -> f32 {
  let i = floor(x);
  let f = fract(x);
  let a = fract(sin(i * 127.1) * 43758.5453);
  let b = fract(sin((i + 1.0) * 127.1) * 43758.5453);
  return mix(a, b, f * f * (3.0 - 2.0 * f));
}

@fragment fn fs(in: FullOut) -> @location(0) vec4f {
  let uv = in.uv;
  let top = vec3f(0.498, 0.784, 0.847);
  let mid = vec3f(0.122, 0.373, 0.541);
  let low = vec3f(0.020, 0.086, 0.165);
  var c = mix(top, mid, smoothstep(0.0, 0.48, uv.y));
  c = mix(c, low, smoothstep(0.38, 1.0, uv.y));
  let x = uv.x * F.aspect;
  let wave = 0.055 + sin(x * 12.0 + F.ambientTime * 0.25) * 0.007
    + sin(x * 23.0 - F.ambientTime * 0.18) * 0.004;
  let surface = exp(-pow((uv.y - wave) / 0.018, 2.0));
  c += vec3f(0.12, 0.18, 0.17) * surface * 0.4;
  // 光の筋ごとに幅と明るさを変え、等間隔の縞に見えないようにする
  var rays = 0.0;
  for (var i = 0u; i < 6u; i++) {
    let fi = f32(i);
    let source = (fi + 0.2 + rand(i + 10u) * 0.6) * F.aspect / 6.0;
    let drift = sin(F.ambientTime * 0.08 + fi * 2.3) * 0.04;
    let width = (0.018 + noise1(fi * 7.0 + F.ambientTime * 0.12) * 0.025) * (1.0 + uv.y * 2.0);
    let d = x - source - uv.y * 0.32 - drift;
    rays += exp(-d * d / (width * width)) * (0.35 + noise1(fi * 3.0 + uv.y * 4.0 + F.ambientTime * 0.1) * 0.65);
  }
  c += vec3f(0.15, 0.23, 0.25) * rays * 0.14 * (1.0 - uv.y);
  return vec4f(c, 1.0);
}
`

/** 滑らかな背景だけを拡大し、微細な粒は出力解像度で重ねる。 */
export const waterComposite = /* wgsl */ `
${RANDOM}
${FULLSCREEN}
@group(0) @binding(0) var image: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@fragment fn fs(in: FullOut) -> @location(0) vec4f {
  let pix = vec2u(in.pos.xy);
  let grain = (rand(pix.x * 1973u + pix.y * 9277u) - 0.5) / 255.0;
  return vec4f(textureSample(image, linearSampler, in.uv).rgb + grain, 1.0);
}
`

const RENDER_FISH = /* wgsl */ `
struct RenderFish {
  center: vec4f, forward: vec4f, dorsal: vec4f,
  style: vec4f, startle: f32,
}
`

/** 個体ごとの投影・反射は一度だけ計算し、四隅から共有する。 */
export const prepareDraw = (schoolStruct: string) => /* wgsl */ `
${schoolStruct}
${FISH}
${RANDOM}
${RENDER_FISH}
@group(0) @binding(0) var<uniform> F: School;
@group(0) @binding(1) var<storage, read> fish: array<Fish>;
@group(0) @binding(2) var<storage, read_write> prepared: array<RenderFish>;
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) id: vec3u) {
  let ii = id.x;
  if (ii >= F.n) { return; }
  let b = fish[ii];
  let p = b.p.xyz;
  let v = b.v.xyz;
  let bank = b.v.w;
  let size = F.fishSize;
  let startle = sin(clamp(b.reaction.y / 0.28, 0.0, 1.0) * 3.141593);
  let fwd = normalize(v + vec3f(0.0, 0.0, 1e-5));
  // 真上を向いたときだけ基準軸を替え、背の方向がゼロになるのを防ぐ
  let reference = select(vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0), abs(fwd.y) > 0.98);
  let up = normalize(reference - fwd * dot(reference, fwd));
  let a = bank * 1.3;
  let dorsal = up * cos(a) + cross(fwd, up) * sin(a);
  let normal = normalize(cross(fwd, dorsal));
  let center = F.viewProj * vec4f(p, 1.0);
  let tip = F.viewProj * vec4f(p + fwd * size * 0.5, 1.0);
  let backTip = F.viewProj * vec4f(p + dorsal * size * 0.14, 1.0);
  // 正面を向いた魚では長さが潰れるので、背の高さも見て拡大のしすぎを防ぐ
  let lengthPx = length((tip.xy / tip.w - center.xy / center.w) * F.res * 0.5) * 2.0;
  let heightPx = length((backTip.xy / backTip.w - center.xy / center.w) * F.res * 0.5) * 2.0;
  let spanPx = max(lengthPx, heightPx);
  let grow = max(1.0, F.minPx / max(spanPx, 1e-3));
  let toEye = normalize(F.eye - p);
  // 銀色の横腹は鏡のように、まわりの水を映す。視線を横腹で返した向きが上（明るい水面）なら光り、
  // 下（暗い深み）なら沈む。曲がって体が傾くと返す向きが上下に振れるので、傾きが伝わると光の帯が走る
  let facing = normal * select(-1.0, 1.0, dot(normal, toEye) >= 0.0);
  let mirrored = reflect(-toEye, facing);
  let flash = mirrored.y;
  let haze = exp(-length(p - F.eye) * F.haze);
  let shade = 0.88 + rand(ii * 7u + 3u) * 0.24;

  prepared[ii] = RenderFish(center,
    F.viewProj * vec4f(fwd * size * 0.5 * grow, 0.0),
    F.viewProj * vec4f(dorsal * size * 0.14 * grow, 0.0),
    vec4f(min(1.0, 1.0 / (grow * grow)), flash, haze, shade), startle);
}
`

/** イワシは進行方向と背の方向に張った四角 */
export const draw = (schoolStruct: string) => /* wgsl */ `
${schoolStruct}
${RENDER_FISH}
${RANDOM}
@group(0) @binding(0) var<uniform> F: School;
@group(0) @binding(1) var<storage, read> prepared: array<RenderFish>;

struct Out {
  @builtin(position) pos: vec4f,
  @location(0) q: vec2f,
  @location(1) coverage: f32,
  @location(2) flash: f32,
  @location(3) haze: f32,
  @location(5) shade: f32,
  @location(6) startle: f32,
}

@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Out {
  let r = prepared[ii];
  let corner = array(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(1, 1))[vi];
  var o: Out;
  o.pos = r.center + r.forward * corner.x + r.dorsal * corner.y;
  o.q = corner;
  o.coverage = r.style.x;
  o.flash = r.style.y;
  o.haze = r.style.z;
  o.shade = r.style.w;
  o.startle = r.startle;
  return o;
}

@fragment fn fs(in: Out) -> @location(0) vec4f {
  let q = in.q;
  // 頭は丸く、尾へ細くなる胴。全長の後ろ 3 割を二股の尾びれに使う
  let bx = (q.x - 0.1) / 0.9;
  let taper = mix(0.45, 1.0, smoothstep(-0.8, 0.0, q.x));
  let body = 1.0 - bx * bx - pow(q.y / (0.72 * taper), 2.0);
  let tailT = clamp((-q.x - 0.35) / 0.65, 0.0, 1.0);
  let outer = 0.1 + tailT * 0.88;
  let inner = max(0.0, (tailT - 0.38) * 0.9);
  let tail = min(min(outer - abs(q.y), abs(q.y) - inner), -q.x - 0.35);
  let shape = max(body, tail);
  let edge = max(fwidth(shape), 1e-4);
  let coverage = smoothstep(-edge, edge, shape) * in.coverage;
  if (coverage < 0.005) { discard; }
  let back = vec3f(0.07, 0.13, 0.18);
  let belly = vec3f(0.62, 0.68, 0.72);
  var c = mix(belly, back, smoothstep(-0.5, 0.6, q.y)) * in.shade;
  let flank = 1.0 - smoothstep(0.2, 0.75, abs(q.y));
  let bright = smoothstep(0.15, 0.6, in.flash);
  let dark = 1.0 - smoothstep(-0.5, 0.0, in.flash);
  c = mix(c, c * 0.45, dark * flank);
  c += vec3f(0.8, 0.92, 1.0) * bright * flank * 1.2;
  // 反応の前縁だけに銀色を薄く足す。元の反射が明るい魚への加算は抑える。
  c = mix(c, max(c, vec3f(0.72, 0.82, 0.88)), in.startle * flank * 0.32);
  // 頭の小さな目で、点の集まりではなく魚の向きを読めるようにする
  let eye = 1.0 - smoothstep(0.035, 0.075, length((q - vec2f(0.65, 0.12)) * vec2f(1.0, 0.28)));
  c = mix(c, back * 0.6, eye);
  let waterColor = mix(vec3f(0.122, 0.373, 0.541), vec3f(0.020, 0.086, 0.165),
    smoothstep(0.38, 1.0, in.pos.y / F.res.y));
  c = mix(waterColor, c, in.haze);
  return vec4f(c, coverage);
}
`

export const SCHOOL_FIELDS = {
  viewProj: 'mat4x4f',
  eye: 'vec3f',
  n: 'u32',
  center: 'vec3f',
  dt: 'f32',
  radii: 'vec3f',
  time: 'f32',
  shockPos: 'vec3f',
  shockPower: 'f32',
  shockRadius: 'f32',
  ambientTime: 'f32',
  predatorA: 'vec3f',
  predatorOn: 'f32',
  predatorB: 'vec3f',
  fearRadius: 'f32',
  predatorPos: 'vec3f',
  flee: 'f32',
  predatorDir: 'vec3f',
  perception: 'f32',
  predatorBend: 'f32',
  predatorPhase: 'f32',
  res: 'vec2f',
  aspect: 'f32',
  sep: 'f32',
  sepRadius: 'f32',
  ali: 'f32',
  coh: 'f32',
  boundary: 'f32',
  current: 'f32',
  maxAcc: 'f32',
  vMin: 'f32',
  vMax: 'f32',
  calm: 'f32',
  relay: 'f32',
  fishSize: 'f32',
  minPx: 'f32',
  haze: 'f32',
} as const
