/** 四角を 1 枚、uMatrix で置く。aPos は 0〜1 */
export const QUAD_VS = /* glsl */ `#version 300 es
  layout(location = 0) in vec2 aPos;
  uniform mat4 uMatrix;
  uniform vec2 uSize;
  out vec2 vUv;
  void main() {
    vUv = aPos;
    gl_Position = uMatrix * vec4(aPos * uSize, 0.0, 1.0);
  }`

/** 注連縄。横に細かく割った帯を、真ん中ほど下がるようにたるませる */
export const ROPE_VS = /* glsl */ `#version 300 es
  layout(location = 0) in vec2 aPos;
  uniform mat4 uMatrix;
  uniform vec2 uSize;
  uniform float uSag;
  out vec2 vUv;
  void main() {
    vUv = aPos;
    vec2 p = aPos * uSize;
    p.y += uSag * 4.0 * aPos.x * (1.0 - aPos.x);
    gl_Position = uMatrix * vec4(p, 0.0, 1.0);
  }`

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  float box(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
`

/**
 * 水の列のテクスチャ（r: 深さ、g: 底の高さ、b: 底の石の濡れ）。
 * x は水盤の内側の左端からの px
 */
const WATER = /* glsl */ `
  uniform highp sampler2D uWater;
  uniform float uDx;
  vec4 column(float x) {
    float n = float(textureSize(uWater, 0).x);
    float f = clamp(x / uDx - 0.5, 0.0, n - 1.0);
    float i = min(floor(f), n - 2.0);
    vec4 a = texelFetch(uWater, ivec2(int(i), 0), 0);
    vec4 b = texelFetch(uWater, ivec2(int(i) + 1, 0), 0);
    return mix(a, b, f - i);
  }
`

/** 石の水盤。縁は荒い花崗岩、内側はなめらかな椀。濡れた所は暗い */
export const STONE_FS = /* glsl */ `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform vec2 uSize;
  uniform vec4 uInner;
  ${NOISE}
  ${WATER}
  out vec4 outColor;
  vec3 granite(vec2 p, vec3 base) {
    float g = fbm(p * 0.08);
    vec3 c = base * (0.9 + 0.16 * g);
    float fleck = hash(floor(p * 0.8));
    c *= 1.0 - 0.22 * step(0.94, fleck);
    c += 0.1 * step(0.975, hash(floor(p * 0.6) + 7.0));
    return c;
  }
  void main() {
    vec2 p = vUv * uSize;
    float aa = 1.0;
    float outer = box(p - uSize * 0.5, uSize * 0.5, 18.0);
    float alpha = 1.0 - smoothstep(-aa, aa, outer);
    vec2 ic = uInner.xy + uInner.zw * 0.5;
    float inner = box(p - ic, uInner.zw * 0.5, 12.0);
    vec3 col;
    if (inner > 0.0) {
      // 縁の上の面。のみ跡の筋と、内と外の角の面取り
      col = granite(p, vec3(0.6, 0.61, 0.565));
      col *= 0.96 + 0.05 * sin(p.x * 0.7 + fbm(p * 0.05) * 9.0);
      col += 0.09 * exp(-inner / 2.5);
      col *= 1.0 - 0.25 * exp(outer / 4.0);
      // 角に苔
      float moss = smoothstep(0.58, 0.72, fbm(p * 0.045 + 3.0)) * smoothstep(-26.0, -4.0, outer);
      col = mix(col, vec3(0.32, 0.42, 0.25) * (0.8 + 0.4 * fbm(p * 0.3)), moss * 0.85);
    } else {
      vec4 c = column(p.x - uInner.x);
      // 椀の底。高い所ほど明るく、縁ぎわは影になる
      col = granite(p * 1.6, vec3(0.47, 0.49, 0.455));
      col *= 0.9 + 0.12 * clamp(c.g / (uInner.z * 0.1), 0.0, 1.0);
      col *= 1.0 - 0.32 * exp(inner / 9.0);
      col *= 1.0 - 0.24 * c.b;
    }
    outColor = vec4(col * alpha, alpha);
  }`

/** 部品のテクスチャ（premultiplied）をそのまま置く */
export const PART_FS = /* glsl */ `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uTex;
  uniform float uAlpha;
  out vec4 outColor;
  void main() {
    outColor = texture(uTex, vUv) * uAlpha;
  }`

/** 角の丸いぼかした影 */
export const SHADOW_FS = /* glsl */ `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform vec2 uSize;
  uniform float uBlur;
  uniform float uAlpha;
  out vec4 outColor;
  void main() {
    vec2 p = vUv * uSize;
    vec2 e = smoothstep(vec2(0.0), vec2(uBlur), p) * smoothstep(vec2(0.0), vec2(uBlur), uSize - p);
    outColor = vec4(0.0, 0.0, 0.0, e.x * e.y * uAlpha);
  }`

/**
 * おみくじ。墨の画素（暗くて色の薄い所）だけを、ひたった分（uMaps の r）に応じて紙の色で隠す。朱の刷りは隠さない。
 * 濡れている間（g）は紙が暗くなり、墨が青みを帯びてにじむ。uFold は結ぶときに折りたたむ分
 */
export const SLIP_FS = /* glsl */ `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uTex;
  uniform highp sampler2D uMaps;
  uniform int uRow;
  uniform vec2 uSize;
  uniform float uFold;
  uniform float uAlpha;
  ${NOISE}
  out vec4 outColor;
  const vec3 PAPER = vec3(0.961, 0.937, 0.875);
  // 紙の色からのずれが、どの色にも同じだけ暗い（灰色の向き）なら墨。朱は赤だけが残るので外れる。
  // ずれの向きで見るので、文字のふちの紙と混ざった薄い画素も、墨か朱かを取り違えない
  float inkOf(vec3 c) {
    vec3 d = max(PAPER - c, 0.0);
    float mx = max(d.r, max(d.g, d.b));
    float mn = min(d.r, min(d.g, d.b));
    return smoothstep(0.015, 0.07, mx) * smoothstep(0.55, 0.8, mn / max(mx, 0.001));
  }
  void main() {
    float n = float(textureSize(uMaps, 0).x);
    float f = clamp(vUv.x * n - 0.5, 0.0, n - 1.0);
    float i = min(floor(f), n - 2.0);
    vec2 m = mix(
      texelFetch(uMaps, ivec2(int(i), uRow), 0).rg,
      texelFetch(uMaps, ivec2(int(i) + 1, uRow), 0).rg,
      f - i
    );
    vec2 px = vUv * uSize;
    // 文字は一度にではなく、むらになってにじみ出る
    float th = 0.2 + 0.6 * fbm(px / 11.0);
    float reveal = smoothstep(th - 0.12, th + 0.12, m.r);
    float wet = m.g;

    vec4 tex = texture(uTex, vUv);
    vec3 c = tex.a > 0.0 ? tex.rgb / tex.a : PAPER;
    float ink = inkOf(c);
    if (wet > 0.01) {
      vec2 d = vec2(1.3) / uSize;
      vec4 b = texture(uTex, vUv + vec2(d.x, 0.0)) + texture(uTex, vUv - vec2(d.x, 0.0))
        + texture(uTex, vUv + vec2(0.0, d.y)) + texture(uTex, vUv - vec2(0.0, d.y));
      vec3 blur = b.rgb / max(b.a, 0.001);
      c = mix(c, blur, 0.55 * wet * max(ink, inkOf(blur)));
      ink = inkOf(c);
    }
    // 濡れた墨は青みのある灰色
    c = mix(c, c * vec3(0.8, 0.92, 1.18) + vec3(0.04, 0.06, 0.1), ink * wet * 0.7);
    c = mix(c, PAPER, ink * (1.0 - reveal));
    // 和紙の繊維と、濡れた紙の暗さ
    float fiber = noise(px * vec2(0.09, 0.6)) * noise(px * vec2(0.6, 0.08));
    c *= 1.0 - 0.035 * fiber;
    c *= mix(vec3(1.0), vec3(0.84, 0.87, 0.86), wet);
    // 折りたたむ。山と谷が交互に明るく暗くなり、刷りも文字も裏に隠れる
    float pleat = abs(fract(vUv.x * 7.0) - 0.5) * 2.0;
    c = mix(c, PAPER * (0.82 + 0.18 * pleat), uFold * 0.9);
    outColor = vec4(c * tex.a, tex.a) * uAlpha;
  }`

/**
 * 水盤を画面へ。水のある所は、奥の絵（uScene）を水面の波の傾きの分だけずらして読み、水の色、光の網、空の映り込みをのせる。
 * 全体に木漏れ日のまだらをかける
 */
export const BASIN_FS = /* glsl */ `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uScene;
  uniform vec2 uSize;
  uniform vec4 uInner;
  uniform float uEq;
  uniform float uFlow;
  uniform float uEnergy;
  uniform float uRoll;
  ${NOISE}
  ${WATER}
  out vec4 outColor;
  const vec3 TINT = vec3(0.72, 0.87, 0.83);

  vec4 scene(vec2 p) {
    vec2 uv = clamp(p / uSize, vec2(0.0005), vec2(0.9995));
    return texture(uScene, vec2(uv.x, 1.0 - uv.y));
  }
  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }
  float cells(vec2 x, float t) {
    vec2 n = floor(x);
    vec2 f = fract(x);
    float d1 = 8.0;
    float d2 = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = 0.5 + 0.42 * sin(t + 6.2831 * hash2(n + g));
        float d = length(g + o - f);
        if (d < d1) { d2 = d1; d1 = d; }
        else if (d < d2) { d2 = d; }
      }
    }
    return d2 - d1;
  }
  // 木漏れ日。葉の影のまだらで、動かない
  float dapple(vec2 p) {
    return smoothstep(0.5, 0.62, fbm(p / 46.0 + 11.0));
  }

  void main() {
    vec2 p = vUv * uSize;
    vec4 base = scene(p);
    if (base.a <= 0.0) discard;
    vec3 col = base.rgb / base.a;
    vec2 lit = p;
    float x = p.x - uInner.x;
    bool inside = x > 0.0 && x < uInner.z && p.y > uInner.y && p.y < uInner.y + uInner.w;
    if (inside) {
      float depth = column(x).r;
      if (depth > 0.02) {
        float slope = (column(x + 3.0).r + column(x + 3.0).g - column(x - 3.0).r - column(x - 3.0).g) / 6.0 - uEq;
        float edge = smoothstep(0.03, 0.5, depth);
        vec2 off = vec2(slope * 70.0, 0.0) * edge;
        off += vec2(sin(p.y * 0.11 + uFlow * 1.7), cos(p.x * 0.09 + uFlow * 1.3)) * 1.4 * uEnergy * edge;
        lit = p + off * 0.6;
        vec4 u = scene(p + off);
        vec3 under = u.rgb / max(u.a, 0.001);
        float k = clamp(depth / 6.0, 0.0, 1.0);
        under *= mix(vec3(1.0), TINT, 0.18 + 0.3 * k);
        float cs = exp(-cells(p / 30.0, uFlow) * 7.0) * 0.6 + exp(-cells(p / 19.0 + 3.1, uFlow * 1.3 + 2.0) * 9.0) * 0.4;
        under += under * cs * (0.05 + 0.32 * uEnergy) * k;
        // 水面に映る空と木の葉。傾けると少しずれる
        float leaves = smoothstep(0.35, 0.7, fbm((p + vec2(uRoll * 500.0, 0.0)) / 110.0 + slope * 1.5));
        vec3 sky = mix(vec3(0.86, 0.93, 0.92), vec3(0.2, 0.3, 0.24), leaves);
        under = mix(under, sky, 0.07 + 0.06 * k);
        float meniscus = exp(-pow((depth - 0.25) / 0.2, 2.0)) * 0.28;
        col = mix(col, under, edge) + vec3(meniscus);
      }
    }
    // 内側の壁ぎわは、縁の影で暗い
    if (inside) {
      float wall = min(min(x, uInner.z - x), min(p.y - uInner.y, uInner.y + uInner.w - p.y));
      col *= 1.0 - 0.3 * exp(-wall / 7.0);
    }
    col *= 0.93 + 0.11 * dapple(lit);
    outColor = vec4(col * base.a, base.a);
  }`

/** 注連縄に結んだおみくじ。細く折った紙を縄に掛け、結び目が少しふくらむ */
export const STRIP_FS = /* glsl */ `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform vec2 uSize;
  uniform float uSeed;
  out vec4 outColor;
  void main() {
    vec2 p = vUv * uSize;
    float knot = smoothstep(0.26, 0.2, vUv.y);
    float half_w = mix(0.5, 0.62, knot) * uSize.x;
    float d = abs(p.x - uSize.x * 0.5) - half_w;
    float alpha = 1.0 - smoothstep(-0.6, 0.6, d);
    alpha *= smoothstep(0.0, 1.5, uSize.y - p.y);
    vec3 c = vec3(0.95, 0.93, 0.87);
    c *= 0.9 + 0.1 * abs(fract(vUv.y * (5.0 + uSeed * 2.0)) - 0.5) * 2.0;
    c *= 1.0 - 0.18 * knot * (0.5 + 0.5 * sin(vUv.x * 9.0 + uSeed * 6.0));
    c *= 0.88 + 0.12 * (1.0 - abs(vUv.x - 0.5) * 2.0);
    // 刷りの朱が端に少しのぞく
    c = mix(c, vec3(0.72, 0.22, 0.16), step(0.62 + uSeed * 0.2, vUv.y) * step(vUv.y, 0.66 + uSeed * 0.2) * 0.6);
    outColor = vec4(c * alpha, alpha);
  }`
