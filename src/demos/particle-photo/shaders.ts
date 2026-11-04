// WGSL。COMMON は 3 つのシェーダーで共有する uniform と関数
export const WG = 256

const COMMON = /* wgsl */ `
struct U {
  time: f32, dt: f32, tStart: f32, count: f32,
  mouse: vec2f, mRadius: f32, mForce: f32,
  spring: f32, damping: f32, flow: f32, flowFreq: f32,
  kick: f32, colorDur: f32, prevTime: f32, shimmer: f32,
  origin: vec2f, view: vec2f,
  sizeMul: f32, stretch: f32, dark: f32, alpha: f32,
  fade: f32, maxAcc: f32, minSize: f32, qw: f32,
  yaw: f32, pitch: f32, depth: f32, dof: f32,
  bloom: f32, env: f32, camDist: f32, qh: f32,
  washN: f32, impasto: f32, shadow: f32, pad: f32,
}
@group(0) @binding(0) var<uniform> u: U;

fn mod289_3(x: vec3f) -> vec3f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn mod289_4(x: vec4f) -> vec4f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn permute4(x: vec4f) -> vec4f { return mod289_4(((x * 34.0) + 1.0) * x); }

// 3D simplex noise。stegu/webgl-noise の src/noise3D.glsl を WGSL に書き直したもの。
// https://github.com/stegu/webgl-noise 。以下は上流の LICENSE をそのまま写したもの。
//
// Copyright (C) 2011 by Ashima Arts (Simplex noise)
// Copyright (C) 2011-2016 by Stefan Gustavson (Classic noise and others)
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
fn snoise(v: vec3f) -> f32 {
  let C = vec2f(1.0 / 6.0, 1.0 / 3.0);
  let D = vec4f(0.0, 0.5, 1.0, 2.0);
  var i = floor(v + dot(v, C.yyy));
  let x0 = v - i + dot(i, C.xxx);
  let g = step(x0.yzx, x0.xyz);
  let l = 1.0 - g;
  let i1 = min(g.xyz, l.zxy);
  let i2 = max(g.xyz, l.zxy);
  let x1 = x0 - i1 + C.xxx;
  let x2 = x0 - i2 + C.yyy;
  let x3 = x0 - D.yyy;
  i = mod289_3(i);
  let p = permute4(permute4(permute4(
      i.z + vec4f(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4f(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4f(0.0, i1.x, i2.x, 1.0));
  let ns = 0.142857142857 * D.wyz - D.xzx;
  let j = p - 49.0 * floor(p * ns.z * ns.z);
  let x_ = floor(j * ns.z);
  let y_ = floor(j - 7.0 * x_);
  let x = x_ * ns.x + ns.yyyy;
  let y = y_ * ns.x + ns.yyyy;
  let h = 1.0 - abs(x) - abs(y);
  let b0 = vec4f(x.xy, y.xy);
  let b1 = vec4f(x.zw, y.zw);
  let s0 = floor(b0) * 2.0 + 1.0;
  let s1 = floor(b1) * 2.0 + 1.0;
  let sh = -step(h, vec4f(0.0));
  let a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  let a1 = b1.xzyw + s1.xzyw * sh.zzww;
  var p0 = vec3f(a0.xy, h.x);
  var p1 = vec3f(a0.zw, h.y);
  var p2 = vec3f(a1.xy, h.z);
  var p3 = vec3f(a1.zw, h.w);
  let nr = 1.79284291400159 - 0.85373472095314 * vec4f(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3));
  p0 *= nr.x; p1 *= nr.y; p2 *= nr.z; p3 *= nr.w;
  var m = max(0.6 - vec4f(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), vec4f(0.0));
  m = m * m;
  return 42.0 * dot(m * m, vec4f(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// 発散ゼロの流れ（Bridson et al. 2007, Curl-Noise for Procedural Fluid Flow）。粒が詰まったり抜けたりしない
fn curl(p: vec2f, t: f32) -> vec2f {
  let e = 0.01;
  let dy = snoise(vec3f(p.x, p.y + e, t)) - snoise(vec3f(p.x, p.y - e, t));
  let dx = snoise(vec3f(p.x + e, p.y, t)) - snoise(vec3f(p.x - e, p.y, t));
  return vec2f(dy, -dx) / (2.0 * e);
}

fn hash22(q: vec2f) -> vec2f {
  var p3 = fract(vec3f(q.xyx) * vec3f(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

fn toLin(c: vec3f) -> vec3f { return select(pow((c + 0.055) / 1.055, vec3f(2.4)), c / 12.92, c <= vec3f(0.04045)); }
fn toSrgb(c: vec3f) -> vec3f { let k = clamp(c, vec3f(0.0), vec3f(1.0)); return select(1.055 * pow(k, vec3f(1.0 / 2.4)) - 0.055, k * 12.92, k <= vec3f(0.0031308)); }
fn oklab(c: vec3f) -> vec3f {
  let l = pow(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b, 1.0 / 3.0);
  let m = pow(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b, 1.0 / 3.0);
  let s = pow(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b, 1.0 / 3.0);
  return vec3f(0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
               1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
               0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}
fn fromOklab(c: vec3f) -> vec3f {
  let l = pow(c.x + 0.3963377774 * c.y + 0.2158037573 * c.z, 3.0);
  let m = pow(c.x - 0.1055613458 * c.y - 0.0638541728 * c.z, 3.0);
  let s = pow(c.x - 0.0894841775 * c.y - 1.2914855480 * c.z, 3.0);
  return vec3f( 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
               -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
               -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}
`

// 1 粒 = vec4 × 6。S: 位置・速度 / H0: 前の居場所・半径・向き / H1: 次の居場所・半径・向き
// C0: 前の色・出発の遅れ / C1: 次の色・次の異方性 / M: 前の異方性・乱数
const PARTICLES = (access: string) => /* wgsl */ `
@group(0) @binding(1) var<storage, ${access}> S: array<vec4f>;
@group(0) @binding(2) var<storage, read> H0: array<vec4f>;
@group(0) @binding(3) var<storage, read> H1: array<vec4f>;
@group(0) @binding(4) var<storage, read> C0: array<vec4f>;
@group(0) @binding(5) var<storage, read> C1: array<vec4f>;
@group(0) @binding(6) var<storage, read> M: array<vec4f>;
`

export const SIM =
  COMMON +
  PARTICLES('read_write') +
  /* wgsl */ `
@compute @workgroup_size(${WG})
fn sim(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u32(u.count)) { return; }
  let s = S[i]; var p = s.xy; var v = s.zw;
  let h0 = H0[i]; let h1 = H1[i]; let c0 = C0[i]; let m = M[i];
  let tl = u.time - u.tStart - c0.w;
  let tp = u.prevTime - u.tStart - c0.w;

  // 自分の番が来た瞬間に一度だけ蹴る。あとはばねが次の居場所へ連れていく
  if (tl >= 0.0 && tp < 0.0) {
    let r = hash22(vec2f(m.y * 917.0, fract(u.tStart * 0.137) * 113.0));
    let away = p - u.origin;
    let outw = away / (length(away) + 0.05);
    let rnd = vec2f(cos(r.x * 6.2831853), sin(r.x * 6.2831853));
    let dir = normalize(outw + rnd * 0.8 + curl(p * 3.0, u.tStart) * 0.12 + vec2f(1e-4, 0.0));
    v += dir * u.kick * (0.3 + 1.0 * r.y);
  }

  let home = select(h0.xy, h1.xy, tl >= 0.0);
  var acc = (home - p) * u.spring;
  let al = length(acc);
  if (al > u.maxAcc) { acc *= u.maxAcc / al; }

  let q = p * u.flowFreq;
  let t = u.time * 0.12;
  // 3 層の fBM。層ごとに座標を回して、縦横の向きの偏りを消す
  var fq = q; var amp = 1.0; var fl = vec2f(0.0);
  for (var o = 0; o < 3; o++) {
    fl += curl(fq, t * (1.0 + f32(o) * 0.6)) * amp;
    fq = mat2x2f(0.8, -0.6, 0.6, 0.8) * fq * 2.1 + vec2f(17.0, 3.0);
    amp *= 0.5;
  }
  acc += fl * u.flow;

  let ang = select(h0.w, h1.w, tl >= 0.0);
  acc += vec2f(cos(ang), sin(ang)) * sin(u.time * 1.7 + m.y * 6.2831853) * u.shimmer;

  let dm = p - u.mouse;
  let rm = length(dm);
  if (rm < u.mRadius) {
    let w = 1.0 - rm / u.mRadius;
    let n = dm / (rm + 1e-4);
    acc += (n + vec2f(-n.y, n.x) * 0.6) * u.mForce * w * w;
  }

  v += acc * u.dt;
  v *= exp(-u.damping * u.dt);
  let sp = length(v);
  if (sp > 6.0) { v *= 6.0 / sp; }
  p += v * u.dt;
  S[i] = vec4f(p, v);
}
`

export const DRAW =
  COMMON +
  PARTICLES('read') +
  /* wgsl */ `
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) col: vec3f,
  @location(2) seed: f32,
  @location(3) blur: vec2f,   // x: ぼけの割合 / y: 面積で割った明るさ
  @location(4) aux: vec2f,    // x: 紙から浮いている度合い（影の元）/ y: 下塗りなら 1
}
@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var quad = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let s = S[ii]; let h0 = H0[ii]; let h1 = H1[ii]; let c0 = C0[ii]; let c1 = C1[ii]; let m = M[ii];
  let tl = u.time - u.tStart - c0.w;
  let k = smoothstep(0.0, 1.0, clamp(tl / u.colorDur, 0.0, 1.0));

  let size = max(mix(h0.z, h1.z, k) * u.sizeMul, u.minSize);
  // 向きは 180° で同じなので、角度を 2 倍した単位ベクトルで混ぜる
  let o = mix(vec2f(cos(2.0 * h0.w), sin(2.0 * h0.w)), vec2f(cos(2.0 * h1.w), sin(2.0 * h1.w)), k);
  let a = 0.5 * atan2(o.y, o.x);
  var dir = vec2f(cos(a), sin(a));
  // 平らな所も少しは伸ばす。丸い点のままだと布の織り目のように見える
  let elong = 1.0 + (0.45 + mix(m.x, c1.w, k)) * u.stretch;
  var len = size * elong;
  var wid = size;

  // 速く飛ぶ粒は進む向きに伸ばす（モーションブラー代わり）
  let v = s.zw;
  let sp = length(v);
  let mt = smoothstep(0.1, 0.8, sp);
  if (sp > 1e-4) {
    var vd = v / sp;
    if (dot(vd, dir) < 0.0) { vd = -vd; }
    dir = normalize(mix(dir, vd, mt));
  }
  len += sp * 0.035 * mt;
  let wash = f32(ii) < u.washN;

  var lab = mix(oklab(toLin(c0.rgb)), oklab(toLin(c1.rgb)), k);
  // 筆ごとに明るさと色相を少しずらす。同じ色を均一に置くと印刷のように見える
  let jit = hash22(vec2f(m.y * 311.0, 7.0)) - 0.5;
  let hr = jit.y * 0.3;
  lab = vec3f(lab.x + jit.x * 0.045, mat2x2f(cos(hr), sin(hr), -sin(hr), cos(hr)) * lab.yz);

  // 奥行き: 明るい所を手前に。飛んでいる粒は乱数の符号で手前か奥へ抜ける
  let z = (lab.x - 0.55) * u.depth + (m.y - 0.5) * 2.0 * min(sp, 3.0) * 0.16;
  let cy = cos(u.yaw); let sy = sin(u.yaw); let cp = cos(u.pitch); let spi = sin(u.pitch);
  let x1 = s.x * cy + z * sy;
  let z1 = -s.x * sy + z * cy;
  let y2 = s.y * cp - z1 * spi;
  let z2 = s.y * spi + z1 * cp;
  let f = u.camDist / max(u.camDist - z2, 0.3);
  // 被写界深度: z = 0 にピント。ぼけた分だけ大きくし、面積で割って明るさを保つ
  let coc = abs(z2) * u.dof * 0.045;
  let grow = (size * f + coc) / (size * f);

  // 動いている粒ほど色を立てる（紙は彩度、夜は明るさ）
  if (u.dark > 0.5) { lab.x *= 1.0 + 0.35 * mt; } else { lab = vec3f(lab.x - 0.03 * mt, lab.yz * (1.0 + 0.3 * mt)); }

  let q = quad[vi];
  let off = dir * (q.x * (len * f + coc)) + vec2f(-dir.y, dir.x) * (q.y * (wid * f + coc));
  var out: VOut;
  out.pos = vec4f((vec2f(x1, y2) * f + off) * u.view, 0.0, 1.0);
  out.uv = q;
  out.col = toSrgb(fromOklab(lab));
  out.seed = m.y;
  // 夜は加算なので、伸びて広がった面積の分だけ暗くしないと遷移の途中で白く飛ぶ
  let rest = size * size * elong * f * f;
  // 下塗りは加算だと白い霞になるので夜は描かない。四角い筆と最低限の伸びで増えた面積の分も割る
  let night = clamp(rest / ((len * f + coc) * (wid * f + coc)), 0.03, 1.0)
            * (1.0 + mix(m.x, c1.w, k) * u.stretch) / elong * 0.8 * select(1.0, 0.0, wash);
  // 紙でも伸びた分だけ薄くする（面積比の平方根）。そのままだと飛ぶ粒が濃い毛の束に見える
  let paper = max(1.0 / (grow * grow), 0.06) * clamp(sqrt(rest / (len * wid * f * f)), 0.18, 1.0);
  out.blur = vec2f(1.0 - 1.0 / grow, select(paper, night, u.dark > 0.5));
  out.aux = vec2f(clamp(mt * (0.5 + 0.8 * m.y), 0.0, 1.0), select(0.0, 1.0, wash));
  return out;
}
fn hash11(x: f32) -> f32 { return fract(sin(x * 127.1) * 43758.5453); }
fn vn(x: f32) -> f32 { let i = floor(x); let f = fract(x); return mix(hash11(i), hash11(i + 1.0), f * f * (3.0 - 2.0 * f)); }
struct FOut {
  @location(0) color: vec4f,
  @location(1) aux: vec4f,   // r: 絵の具の厚み / g: 浮いている粒の覆い / b: 覆い（加算で重ねる）
}
@fragment
fn fs(in: VOut) -> FOut {
  let s = in.uv.x; let t = in.uv.y; let b = in.blur.x;
  // 角の丸い四角（superellipse）で面を埋める。ぼけるほど丸に戻す
  let pw = mix(2.8, 2.0, b);
  let e = pow(abs(s), pw) + pow(abs(t), pw);
  if (e > 1.0) { discard; }
  let edge = 1.0 - smoothstep(mix(0.6, 0.15, b), 1.0, e);
  let k = in.seed * 61.0;
  let br = vn(t * 6.0 + k) * 0.6 + vn(t * 15.0 + k * 1.7) * 0.4;   // 筆の毛のすじ
  let dry = smoothstep(-1.05, -0.35, s + (br - 0.5) * 0.8);          // 筆の後ろ側のかすれ
  let tex = mix(mix(0.72 + 0.28 * br, 1.0, b) * mix(dry, 1.0, b), 1.0, in.aux.y * 0.6);
  let a = edge * tex * u.alpha * in.blur.y * mix(1.0, 0.6, in.aux.y);
  var o: FOut;
  o.color = select(vec4f(in.col * a, a), vec4f(in.col * a * 0.55, 0.0), u.dark > 0.5);
  // 厚み: 毛のすじで溝、幅方向に盛り上がり、かすれた所と下塗りは薄い（Hertzmann 2002 の筆跡の高さ場）
  let h = edge * (0.45 + 0.55 * br) * sqrt(max(1.0 - t * t, 0.0)) * mix(dry, 1.0, 0.4) * (1.0 - b) * mix(1.0, 0.3, in.aux.y);
  o.aux = vec4f(h * in.blur.y, in.aux.x * a, a, 0.0);
  return o;
}
`

export const POST =
  COMMON +
  /* wgsl */ `
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;
@group(0) @binding(3) var glow: texture_2d<f32>;
@group(0) @binding(4) var aux: texture_2d<f32>;
const PAPER = vec3f(0.957, 0.949, 0.933);
@vertex
fn vsFull(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
@fragment
fn fsFade(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let prev = textureLoad(tex, vec2i(fc.xy), 0).rgb;
  let bg = select(PAPER, vec3f(0.0), u.dark > 0.5);
  return vec4f(mix(prev, bg, u.fade), 1.0);
}
// bloom（夜だけ）: 1/4 の大きさで明るい所を拾い、縦横に分けてぼかす
@fragment
fn fsBright(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / vec2f(u.qw, u.qh);
  let t = 1.0 / vec2f(textureDimensions(tex));
  var c = vec3f(0.0);
  for (var i = 0; i < 4; i++) {
    let o = vec2f(f32(i & 1) - 0.5, f32(i >> 1) - 0.5) * t * 2.0;
    c += textureSampleLevel(tex, smp, uv + o, 0.0).rgb;
  }
  c *= 0.25;
  let l = max(c.r, max(c.g, c.b));
  return vec4f(c * smoothstep(0.25, 1.1, l), 1.0);
}
// 影（紙だけ）: 浮いている粒の覆いと全体の覆いを 1/4 の大きさで拾い、bloom と同じ経路でぼかす
@fragment
fn fsShadowSrc(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = vec2i(fc.xy) * 4;
  var c = vec2f(0.0);
  for (var i = 0; i < 4; i++) { c += textureLoad(aux, p + vec2i(i & 1, i >> 1) * 2 + 1, 0).gb; }
  return vec4f(min(c * 0.25, vec2f(1.0)), 0.0, 1.0);
}
fn h12(q: vec2f) -> f32 { return hash22(q).x; }
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p); let w = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2f(1.0, 0.0)), w.x), mix(h12(i + vec2f(0.0, 1.0)), h12(i + vec2f(1.0, 1.0)), w.x), w.y);
}
// 紙の凹凸。細かい繊維と、ゆるいむら
fn paperH(p: vec2f) -> f32 {
  return vnoise(p * vec2f(0.9, 0.35)) * 0.5 + vnoise(p * 0.45 + 13.0) * 0.35 + vnoise(p * 0.08 + 71.0) * 0.6;
}
const LIGHT = vec3f(-0.5, -0.62, 0.6);   // 左上から（画面の y は下向き）
fn blur(fc: vec2f, dir: vec2f) -> vec4f {
  let t = dir / vec2f(textureDimensions(tex));
  let uv = fc / vec2f(textureDimensions(tex));
  var w = array<f32, 5>(0.227, 0.194, 0.122, 0.054, 0.016);
  var c = textureSampleLevel(tex, smp, uv, 0.0).rgb * w[0];
  for (var i = 1; i < 5; i++) {
    let o = t * f32(i) * 1.5;
    c += (textureSampleLevel(tex, smp, uv + o, 0.0).rgb + textureSampleLevel(tex, smp, uv - o, 0.0).rgb) * w[i];
  }
  return vec4f(c, 1.0);
}
@fragment fn fsBlurH(@builtin(position) fc: vec4f) -> @location(0) vec4f { return blur(fc.xy, vec2f(1.0, 0.0)); }
@fragment fn fsBlurV(@builtin(position) fc: vec4f) -> @location(0) vec4f { return blur(fc.xy, vec2f(0.0, 1.0)); }

@fragment
fn fsPresent(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(tex));
  var c = textureLoad(tex, vec2i(fc.xy), 0).rgb;
  let uv = fc.xy / dims;
  if (u.dark > 0.5) {
    // 遷移の途中でいちばん強く、組み上がったら控えめに戻す
    c += textureSampleLevel(glow, smp, uv, 0.0).rgb * u.bloom * (0.3 + 0.9 * u.env);
    c = 1.0 - exp(-c * 1.3 * (1.0 - 0.45 * u.env));
  } else {
    let L = normalize(LIGHT);
    let px = vec2i(fc.xy);
    let a0 = textureLoad(aux, px, 0);
    let cov = clamp(a0.b, 0.0, 1.0);
    // 絵の具の厚みの高さ場を斜めの光で照らす。重なった筆の縁と毛のすじが立つ
    let sc = dims.y / 1000.0;
    let d = i32(max(1.0, round(sc)));
    let H = vec4f(textureLoad(aux, px + vec2i(d, 0), 0).r, textureLoad(aux, px - vec2i(d, 0), 0).r,
                  textureLoad(aux, px + vec2i(0, d), 0).r, textureLoad(aux, px - vec2i(0, d), 0).r);
    let Hs = 1.0 - exp(-1.3 * H);
    let n = normalize(vec3f(-(Hs.x - Hs.y), -(Hs.z - Hs.w), 1.4 / max(u.impasto, 1e-3)));
    let diff = clamp(dot(n, L) / L.z, 0.8, 1.15);
    let hv = normalize(L + vec3f(0.0, 0.0, 1.0));
    let spec = max(pow(max(dot(n, hv), 0.0), 48.0) - pow(hv.z, 48.0), 0.0);
    c = c * mix(1.0, diff, min(u.impasto, 1.0) * cov) + spec * 0.08 * cov * min(u.impasto, 1.0);
    // 紙の凹凸。絵の具の薄い所ほど見える
    let pp = fc.xy / sc;
    let e = 1.0;
    let ph = vec3f(paperH(pp), paperH(pp + vec2f(e, 0.0)), paperH(pp + vec2f(0.0, e)));
    let pn = normalize(vec3f(-(ph.y - ph.x), -(ph.z - ph.x), 2.2));
    c *= mix(1.0, dot(pn, L) / L.z, 0.35 * (1.0 - 0.85 * cov)) * (1.0 - 0.02 * ph.x * (1.0 - cov));
    // 影: 浮いた粒は遠くへ、絵全体は紙にすぐ接する短い影を落とす
    let asp = dims.y / dims.x;
    let lift = textureSampleLevel(glow, smp, uv - vec2f(0.011 * asp, 0.016), 0.0).r;
    let contact = textureSampleLevel(glow, smp, uv - vec2f(0.0025 * asp, 0.0035), 0.0).g;
    c *= 1.0 - u.shadow * (0.45 * lift * (1.0 - clamp(a0.g * 2.0, 0.0, 1.0)) + 0.22 * contact * (1.0 - cov));
  }
  let r = length((uv - 0.5) * vec2f(dims.x / dims.y, 1.0));
  c *= 1.0 - smoothstep(0.45, 1.25, r) * select(0.10, 0.45, u.dark > 0.5);
  let g = fract(sin(dot(fc.xy, vec2f(12.9898, 78.233))) * 43758.5453) - 0.5;
  return vec4f(c + g * 0.02, 1.0);
}
`
