// 座標は紙の縮める前の px。x は横、y は紙の天（0）から地（PAPER_H）、z は机から上。
// 画面へは斜投影（z の分だけ上へずらす）で写す。平らな紙は z = 0 なので、写し方が平行移動と拡大だけになり、当たり判定がずれない

const COMMON = /* glsl */ `
  uniform vec2 uView;
  uniform vec2 uOrigin;
  uniform float uK;
  uniform float uKy;
  vec4 toClip(vec3 p) {
    vec2 sc = uOrigin + uK * vec2(p.x, p.y - uKy * p.z);
    vec2 c = sc / uView * 2.0 - 1.0;
    // 目の向きは (0, uKy, 1)。この向きに進んだ点ほど手前にある
    return vec4(c.x, -c.y, -(uKy * p.y + p.z) / 3000.0, 1.0);
  }
`

const NOISE = /* glsl */ `
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }
  mat2 rot(float a) {
    float c = cos(a);
    float s = sin(a);
    return mat2(c, -s, s, c);
  }
  // 楮の繊維。向きの違う細長いノイズを重ね、ところどころだけ浮かせる
  float fibers(vec2 p) {
    float f = 0.0;
    f += smoothstep(0.62, 0.95, vnoise(rot(0.4) * p * vec2(0.05, 1.1)));
    f += smoothstep(0.62, 0.95, vnoise(rot(-1.2) * p * vec2(0.04, 0.9) + 13.0));
    f += smoothstep(0.62, 0.95, vnoise(rot(2.1) * p * vec2(0.06, 1.3) + 31.0));
    return f / 3.0;
  }
  float mottle(vec2 p) {
    return vnoise(p * 0.018) * 0.6 + vnoise(p * 0.06 + 7.0) * 0.4;
  }
`

export const PAPER_VS = /* glsl */ `#version 300 es
  layout(location = 0) in vec2 aSY;
  ${COMMON}
  // 巻きの中心の x、外の半径、芯の半径、平らな所との境目の s
  uniform vec4 uRollR;
  uniform vec4 uRollL;
  uniform float uLen;
  uniform float uThick;
  uniform float uLift;
  out vec2 vSY;
  out vec3 vPic;
  out vec3 vPos;
  out float vSide;
  out float vR;
  const float PI = 3.14159265;
  void main() {
    float s = aSY.x;
    float y = aSY.y;
    vec3 p;
    vec3 n;
    float side = 0.0;
    float r = 0.0;
    // 巻きは等間隔の渦。中に入っている長さから半径が決まり、外からの角度は半径の差に比例する
    if (s < uRollR.w) {
      r = sqrt(uRollR.z * uRollR.z + uThick * s / PI);
      float th = 2.0 * PI * (uRollR.y - r) / uThick;
      p = vec3(uRollR.x + r * sin(th), y, uRollR.y - r * cos(th));
      n = vec3(-sin(th), 0.0, cos(th));
      side = -1.0;
    } else if (s > uRollL.w) {
      r = sqrt(uRollL.z * uRollL.z + uThick * (uLen - s) / PI);
      float th = 2.0 * PI * (uRollL.y - r) / uThick;
      p = vec3(uRollL.x - r * sin(th), y, uRollL.y - r * cos(th));
      n = vec3(sin(th), 0.0, cos(th));
      side = 1.0;
    } else {
      float x = uRollR.x - (s - uRollR.w);
      float span = max(uRollR.x - uRollL.x, 1.0);
      float a = PI * (x - uRollL.x) / span;
      p = vec3(x, y, uLift * sin(a));
      n = normalize(vec3(-uLift * PI / span * cos(a), 0.0, 1.0));
    }
    vSY = aSY;
    vPic = n;
    vPos = p;
    vSide = side;
    vR = r;
    gl_Position = toClip(p);
  }`

export const PAPER_FS = /* glsl */ `#version 300 es
  precision highp float;
  in vec2 vSY;
  in vec3 vPic;
  in vec3 vPos;
  in float vSide;
  in float vR;
  uniform sampler2D uTex;
  // 1 枚の幅と高さ（atlas に対する割合）、列の数、枚数
  uniform vec4 uAtlas;
  uniform float uSheetW;
  uniform float uPH;
  uniform float uLen;
  uniform float uKy;
  uniform vec4 uRollR;
  uniform vec4 uRollL;
  out vec4 outColor;
  const float PI = 3.14159265;
  // 紙の地の色。Demo.astro の --paper と同じ
  const vec3 PAPER = vec3(0.937, 0.902, 0.824);
  const vec3 BACK = vec3(0.93, 0.9, 0.84);
  const vec3 LIGHT = vec3(-0.45, -0.35, 0.82) / 1.0;
  ${NOISE}

  // 紙の上の位置 s の絵。atlas は右から左へ紙を並べてあるので、巻物と同じ向きにつながる
  vec3 ink(float s, float y) {
    float i = clamp(floor(s / uSheetW), 0.0, uAtlas.w - 1.0);
    float u = 1.0 - clamp((s - i * uSheetW) / uSheetW, 0.0, 1.0);
    float col = uAtlas.z - 1.0 - mod(i, uAtlas.z);
    float row = floor(i / uAtlas.z);
    vec2 uv = vec2((col + u) * uAtlas.x, (row + clamp(y / uPH, 0.002, 0.998)) * uAtlas.y);
    return texture(uTex, uv).rgb;
  }

  // 裏から透けた墨。紙の中で光が散るのでぼかし、色も少し抜く
  vec3 seep(float s, float y, float blur, float sat) {
    vec3 t = ink(s + blur, y + blur * 0.6) + ink(s - blur, y - blur * 0.6)
      + ink(s + blur * 0.6, y - blur) + ink(s - blur * 0.6, y + blur);
    vec3 ratio = clamp(t * 0.25 / PAPER, 0.0, 1.15);
    return mix(vec3(dot(ratio, vec3(0.3333))), ratio, sat);
  }

  void main() {
    float s = vSY.x;
    float y = vSY.y;
    float half_ = step(uPH * 0.5, y);
    float edge = min(y, uPH - y);
    float rough = 0.5 + 1.8 * vnoise(vec2(s * 0.08, half_ * 17.0))
      + 0.8 * vnoise(vec2(s * 0.45, half_ * 5.0 + 3.0));
    if (edge < rough) discard;

    vec3 light = normalize(LIGHT);
    vec2 p = vec2(s, y);
    float fib = fibers(p);
    float cloud = mottle(p);
    float onRoll = step(0.5, abs(vSide));
    // 紙継ぎ。2 枚が重なる所は厚く、少し暗く、透けにくい
    float seamD = abs(s - uSheetW * floor(s / uSheetW + 0.5));
    float seam = (s > uSheetW * 0.5 && s < uLen - uSheetW * 0.5)
      ? 1.0 - smoothstep(2.0, 4.0, seamD) : 0.0;

    vec3 col;
    vec3 n;
    if (onRoll < 0.5) {
      n = normalize(vPic);
      // 机に置いた紙のゆるい波打ち
      vec2 g = vec2(
        vnoise(p * 0.012 + vec2(0.4, 0.0)) - vnoise(p * 0.012 - vec2(0.4, 0.0)),
        vnoise(p * 0.012 + vec2(0.0, 0.4)) - vnoise(p * 0.012 - vec2(0.0, 0.4))
      );
      n = normalize(n + vec3(g * 0.35, 0.0));
      col = ink(s, y);
      col *= 0.985 + 0.03 * cloud - 0.035 * fib;
      col *= 1.0 - 0.04 * seam;
    } else {
      // 巻きの外に見えるのは紙の裏。絵は内側にある
      n = -normalize(vPic);
      vec3 back = BACK * (0.955 + 0.06 * cloud - 0.05 * fib);
      col = back * mix(vec3(1.0), seep(s, y, 1.4, 0.75), 0.36 * (1.0 - 0.45 * seam));
      // 1 巻き内側の絵も、もう 2 枚ぶんの紙を通して薄く見える
      float s2 = s + vSide * 2.0 * PI * vR;
      if (s2 > 0.0 && s2 < uLen) {
        col *= mix(vec3(1.0), seep(s2, y, 3.0, 0.5), 0.14);
      }
      col *= 1.0 - 0.06 * seam;
    }

    float shade = 1.0 + 0.55 * (dot(n, light) - light.z);
    if (onRoll > 0.5) {
      // 机に近い下の側と、輪郭のきわを暗く。上にはやわらかい照り
      vec3 view = normalize(vec3(0.0, uKy, 1.0));
      shade *= mix(0.45, 1.0, smoothstep(-0.9, 0.45, n.z));
      shade *= mix(0.5, 1.0, pow(clamp(dot(n, view), 0.0, 1.0), 0.7));
      shade += 0.07 * pow(max(dot(reflect(-light, n), view), 0.0), 6.0);
    } else {
      float dL = vPos.x - uRollL.x;
      float dR = uRollR.x - vPos.x;
      float occ = 1.0;
      occ -= 0.32 * exp(-max(dL - uRollL.y * 0.9, 0.0) / (uRollL.y * 0.45 + 3.0));
      // 左上からの光で、左の巻きの影が右へ落ちる
      occ -= 0.14 * exp(-max(dL - uRollL.y, 0.0) / (uRollL.y * 1.3 + 6.0));
      occ -= 0.32 * exp(-max(dR - uRollR.y * 0.9, 0.0) / (uRollR.y * 0.45 + 3.0));
      shade *= occ;
    }
    outColor = vec4(col * shade, 1.0);
  }`

// 巻きの手前の端（木口）。層の境目を渦の線として描く
export const FACE_VS = /* glsl */ `#version 300 es
  layout(location = 0) in vec2 aC;
  ${COMMON}
  // 中心の x、外の半径、芯の半径、巻く向き（左の巻きは 1、右は -1）
  uniform vec4 uRoll;
  uniform float uFaceY;
  out vec2 vLocal;
  void main() {
    vLocal = aC * uRoll.y;
    gl_Position = toClip(vec3(uRoll.x + vLocal.x, uFaceY, uRoll.y + vLocal.y));
  }`

export const FACE_FS = /* glsl */ `#version 300 es
  precision highp float;
  in vec2 vLocal;
  uniform vec4 uRoll;
  uniform float uThick;
  out vec4 outColor;
  const float PI = 3.14159265;
  ${NOISE}
  void main() {
    float rho = length(vLocal);
    float R = uRoll.y;
    float core = uRoll.z;
    if (rho > R) discard;
    if (rho < core) {
      outColor = vec4(vec3(0.16, 0.1, 0.07) * (0.7 + 0.3 * rho / core), 1.0);
      return;
    }
    // 紙が下の接点から巻き始める向きで測った角度
    float th = mod(atan(-uRoll.w * vLocal.x, -vLocal.y), 2.0 * PI);
    float k = (R - rho) / uThick - th / (2.0 * PI);
    float f = fract(k);
    float w = fwidth(k);
    float gap = 1.0 - smoothstep(0.0, w * 1.3 + 0.02, min(f, 1.0 - f));
    // 線が細かすぎて潰れる所は、線を消して平均の濃さにする
    float dense = smoothstep(0.35, 0.8, w);
    vec3 paper = vec3(0.85, 0.8, 0.7) * (0.9 + 0.1 * hash(vec2(floor(k), 3.0)));
    vec3 col = paper * mix(1.0 - 0.5 * gap, 0.84, dense);
    // 外の縁と芯のきわは暗い
    col *= 0.72 + 0.28 * smoothstep(core, core + 5.0, rho);
    col *= 0.8 + 0.2 * smoothstep(R, R - 3.0, rho);
    // 手前を向いた面は、左上からの光が当たりにくい
    col *= 0.86 + 0.08 * (vLocal.y / R);
    outColor = vec4(col, 1.0);
  }`

// 軸と軸首。y の向きの円柱で、手前の端にふた（cap）がある
export const ROD_VS = /* glsl */ `#version 300 es
  layout(location = 0) in vec3 aC;
  ${COMMON}
  // 中心の x、中心の z、半径
  uniform vec3 uRod;
  // 奥の端と手前の端の y
  uniform vec2 uSpan;
  out vec3 vN;
  out float vT;
  void main() {
    float a = aC.x;
    vec3 p;
    if (aC.z > 0.5) {
      p = vec3(uRod.x + uRod.z * aC.y * sin(a), uSpan.y, uRod.y + uRod.z * aC.y * cos(a));
      vN = vec3(0.0, 1.0, 0.0);
      vT = 1.0;
    } else {
      p = vec3(uRod.x + uRod.z * sin(a), mix(uSpan.x, uSpan.y, aC.y), uRod.y + uRod.z * cos(a));
      vN = vec3(sin(a), 0.0, cos(a));
      vT = aC.y;
    }
    gl_Position = toClip(p);
  }`

export const ROD_FS = /* glsl */ `#version 300 es
  precision highp float;
  in vec3 vN;
  in float vT;
  uniform vec3 uColor;
  // 金の帯を巻く位置（0〜1）。使わないときは負の値
  uniform float uBand;
  uniform float uKy;
  out vec4 outColor;
  void main() {
    vec3 n = normalize(vN);
    vec3 light = normalize(vec3(-0.45, -0.35, 0.82));
    vec3 view = normalize(vec3(0.0, uKy, 1.0));
    vec3 base = uColor;
    if (uBand >= 0.0 && abs(vT - uBand) < 0.12) base = vec3(0.72, 0.56, 0.25);
    float diff = max(dot(n, light), 0.0);
    float spec = pow(max(dot(n, normalize(light + view)), 0.0), 36.0);
    outColor = vec4(base * (0.32 + 0.75 * diff) + spec * 0.45, 1.0);
  }`

// 机に落ちる紙と巻きの影。画面いっぱいの四角を描き、画素ごとに紙の座標へ戻して影の濃さを求める
export const SHADOW_VS = /* glsl */ `#version 300 es
  layout(location = 0) in vec2 aC;
  void main() {
    gl_Position = vec4(aC, 0.0, 1.0);
  }`

export const SHADOW_FS = /* glsl */ `#version 300 es
  precision highp float;
  uniform vec2 uView;
  uniform vec2 uOrigin;
  uniform float uK;
  uniform float uDpr;
  uniform float uPH;
  uniform vec4 uRollR;
  uniform vec4 uRollL;
  out vec4 outColor;
  float box(vec2 p, vec2 a, vec2 b, float blur) {
    vec2 lo = smoothstep(a - blur, a + blur, p);
    vec2 hi = 1.0 - smoothstep(b - blur, b + blur, p);
    return lo.x * lo.y * hi.x * hi.y;
  }
  void main() {
    vec2 sc = vec2(gl_FragCoord.x, uView.y * uDpr - gl_FragCoord.y) / uDpr;
    vec2 d = (sc - uOrigin) / uK;
    float a = 0.42 * box(d - vec2(6.0, 9.0), vec2(uRollL.x, 0.0), vec2(uRollR.x, uPH), 9.0);
    a = max(a, 0.55 * box(d - vec2(14.0, 10.0), vec2(uRollL.x - uRollL.y, -12.0),
      vec2(uRollL.x + uRollL.y * 1.4, uPH + 14.0), uRollL.y * 0.5 + 5.0));
    a = max(a, 0.55 * box(d - vec2(14.0, 10.0), vec2(uRollR.x - uRollR.y, -6.0),
      vec2(uRollR.x + uRollR.y * 1.4, uPH + 8.0), uRollR.y * 0.5 + 5.0));
    outColor = vec4(0.0, 0.0, 0.0, a);
  }`
