import { createProgram } from '../../shared/html-canvas'

const NOISE = /* glsl */ `
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }
`

const SHEET_VS = /* glsl */ `#version 300 es
  layout(location = 0) in vec3 aPos;
  layout(location = 1) in vec2 aUv;
  layout(location = 2) in float aHeat;
  layout(location = 3) in vec3 aNormal;
  uniform mat4 uMatrix;
  out vec2 vUv;
  out float vHeat;
  out vec3 vNormal;
  out vec3 vWorld;
  void main() {
    vUv = aUv;
    vHeat = aHeat;
    vNormal = aNormal;
    vWorld = aPos;
    gl_Position = uMatrix * vec4(aPos, 1.0);
  }`

const SHEET_FS = /* glsl */ `#version 300 es
  precision highp float;
  in vec2 vUv;
  in float vHeat;
  in vec3 vNormal;
  in vec3 vWorld;
  uniform sampler2D uTex;
  uniform vec2 uSize;
  // ちぎれ線: x は要素の中の y（px）、y はぎざぎざの大きさ、z は短冊ごとの種
  uniform vec3 uSeam;
  // 0: ちぎれ線より下（本体）、1: ちぎれ線より上（半券）
  uniform float uPart;
  uniform float uStretch;
  uniform float uShade;
  // ちぎれた口の見え方。0 はまだつながっている所
  uniform float uEdge;
  uniform vec4 uFire;
  uniform float uTime;
  out vec4 outColor;
  ${NOISE}

  float seamAt(float x) {
    return uSeam.x
      + (noise(vec2(x * 0.09, uSeam.z)) - 0.5) * 2.0 * uSeam.y
      + (hash(vec2(floor(x * 0.7), uSeam.z)) - 0.5) * 1.6;
  }

  void main() {
    vec2 local = vUv * uSize;
    float seam = seamAt(local.x);
    float below = local.y - seam;
    if (uPart < 0.5 ? below < 0.0 : below > 0.0) discard;

    float h = vHeat + (fbm(vUv * vec2(4.0, 20.0) + uSeam.z) - 0.5) * 0.24;
    if (h > 1.0) discard;
    vec4 tex = texture(uTex, vUv);
    if (tex.a < 0.01) discard;
    vec3 base = tex.rgb / max(tex.a, 1e-4);

    // 月明かりくらいの暗さに落とし、火に近いほど暖かく照らす
    vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
    vec3 toFire = vec3(uFire.xy - vWorld.xy, 80.0 - vWorld.z);
    float d = length(toFire.xy);
    float facing = 0.55 + 0.45 * max(dot(n, normalize(toFire)), 0.0);
    float warm = min(uFire.z * facing * 1.3 / (1.0 + pow(d / 240.0, 2.0)), 0.85);
    vec3 moon = vec3(0.38, 0.4, 0.47) * (0.75 + 0.25 * n.z);
    vec3 light = moon + vec3(1.0, 0.62, 0.32) * warm;
    vec3 color = base * light * uShade;

    // 綴じ目が伸びると、紙の繊維が白く見える
    float fiber = (1.0 - smoothstep(0.0, 5.0, abs(below))) * uStretch;
    color = mix(color, vec3(0.92, 0.9, 0.84) * light, fiber * 0.7);
    // ちぎれた口は、紙の繊維が白く見える。半券は口の手前が少し暗い（下の紙に落ちる影の代わり）
    float lip = 1.0 - smoothstep(0.0, 1.1, abs(below));
    if (uPart > 0.5) color *= 1.0 - (1.0 - smoothstep(0.0, 3.0, -below)) * 0.4 * uEdge;
    color = mix(color, vec3(0.95, 0.93, 0.88) * light, lip * 0.75 * uEdge);

    // 焦げ、光る燃え際、炭
    float scorch = smoothstep(0.12, 0.5, h);
    color *= mix(vec3(1.0), vec3(0.55, 0.36, 0.2), scorch);
    float ink = 1.0 - smoothstep(0.15, 0.6, dot(base, vec3(0.3, 0.55, 0.15)));
    float flick = 0.75 + 0.25 * noise(vec2(uTime * 9.0, vUv.y * 30.0));
    float edge = 1.0 - smoothstep(0.0, 0.07, abs(h - 0.9));
    float charred = smoothstep(0.66, 0.84, h);
    vec3 ash = mix(vec3(0.09, 0.075, 0.065), vec3(0.2, 0.18, 0.16), noise(vUv * vec2(30.0, 90.0)));
    color = mix(color, ash, charred);
    color += vec3(1.0, 0.42, 0.1) * edge * 1.4 * flick;
    // 燃え際が墨の字に届くと、字が先に赤く光る
    float near = smoothstep(0.4, 0.62, h) * (1.0 - charred);
    color += vec3(1.0, 0.3, 0.06) * ink * near * 1.2 * flick;
    float a = tex.a * (1.0 - charred * 0.25);
    outColor = vec4(color * a, a);
  }`

const FLAT_VS = /* glsl */ `#version 300 es
  layout(location = 0) in vec2 aPos;
  layout(location = 1) in vec4 aColor;
  uniform vec2 uSize;
  out vec4 vColor;
  void main() {
    vColor = aColor;
    gl_Position = vec4(aPos.x / uSize.x * 2.0 - 1.0, 1.0 - aPos.y / uSize.y * 2.0, 0.0, 1.0);
  }`

const FLAT_FS = /* glsl */ `#version 300 es
  precision highp float;
  in vec4 vColor;
  out vec4 outColor;
  void main() {
    outColor = vColor;
  }`

const POINT_VS = /* glsl */ `#version 300 es
  layout(location = 0) in vec2 aPos;
  layout(location = 1) in vec4 aColor;
  layout(location = 2) in float aSize;
  uniform vec2 uSize;
  uniform float uDpr;
  out vec4 vColor;
  void main() {
    vColor = aColor;
    gl_PointSize = aSize * uDpr;
    gl_Position = vec4(aPos.x / uSize.x * 2.0 - 1.0, 1.0 - aPos.y / uSize.y * 2.0, 0.0, 1.0);
  }`

const POINT_FS = /* glsl */ `#version 300 es
  precision highp float;
  in vec4 vColor;
  uniform float uSoft;
  out vec4 outColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = pow(max(1.0 - d, 0.0), uSoft);
    outColor = vColor * a;
  }`

// 炎。下から上へ流れるノイズを、上ほど細くなる形で切り抜く
const FLAME_VS = /* glsl */ `#version 300 es
  layout(location = 0) in vec2 aPos;
  uniform vec4 uRect;
  uniform vec2 uSize;
  out vec2 vUv;
  void main() {
    vUv = aPos;
    vec2 p = uRect.xy + aPos * uRect.zw;
    gl_Position = vec4(p.x / uSize.x * 2.0 - 1.0, 1.0 - p.y / uSize.y * 2.0, 0.0, 1.0);
  }`

const FLAME_FS = /* glsl */ `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform float uTime;
  uniform float uPower;
  uniform float uGain;
  out vec4 outColor;
  ${NOISE}
  void main() {
    // vUv.y は上が 0、下が 1。up は根もとから先へ 0〜1
    float up = 1.0 - vUv.y;
    vec2 q = vec2(vUv.x * 3.2, up * 2.2 - uTime * 1.7);
    float n = fbm(q + vec2(0.0, fbm(q * 1.7 + uTime * 0.4)));
    float x = abs(vUv.x - 0.5) * 2.0 + (n - 0.5) * 0.9 * up;
    float width = mix(0.95, 0.05, pow(up / uPower, 0.8));
    float body = smoothstep(width, width * 0.25, x) * smoothstep(1.05, 0.2, up / uPower);
    float v = body * (0.55 + n * 0.9);
    vec3 color = mix(vec3(0.55, 0.08, 0.02), vec3(1.0, 0.45, 0.08), smoothstep(0.15, 0.6, v));
    color = mix(color, vec3(1.0, 0.86, 0.55), smoothstep(0.75, 1.2, v));
    // 根もとの熾火
    float coal = exp(-pow((vUv.y - 0.93) * 9.0, 2.0)) * smoothstep(1.0, 0.55, abs(vUv.x - 0.5) * 2.0);
    coal *= 0.6 + 0.4 * noise(vec2(vUv.x * 14.0, uTime * 1.5));
    vec3 glow = vec3(1.0, 0.3, 0.06) * coal * 0.9;
    outColor = vec4((color * v * 1.1 + glow) * uGain, 0.0);
  }`

// 火の明かり。canvas の下の HTML（札掛けや地面）を、加算で照らす
const GLOW_FS = /* glsl */ `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform vec2 uCenter;
  uniform vec2 uSize;
  uniform float uPower;
  out vec4 outColor;
  void main() {
    vec2 p = vUv * uSize;
    float d = length((p - uCenter) * vec2(1.0, 1.25));
    float a = uPower / (1.0 + pow(d / 210.0, 2.0)) - 0.04;
    outColor = vec4(vec3(1.0, 0.5, 0.2) * max(a, 0.0) * 0.2, 0.0);
  }`

export interface SheetMesh {
  vao: WebGLVertexArrayObject
  buffer: WebGLBuffer
  data: Float32Array
  count: number
}

export const createRenderer = (gl: WebGL2RenderingContext) => {
  const sheet = createProgram(gl, SHEET_VS, SHEET_FS)
  const flat = createProgram(gl, FLAT_VS, FLAT_FS)
  const point = createProgram(gl, POINT_VS, POINT_FS)
  const flame = createProgram(gl, FLAME_VS, FLAME_FS)
  const glow = createProgram(gl, FLAME_VS, GLOW_FS)

  const arrays = (sizes: number[], indexed?: Uint16Array) => {
    const vao = gl.createVertexArray()
    const buffer = gl.createBuffer()
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    const stride = sizes.reduce((a, b) => a + b, 0) * 4
    let offset = 0
    sizes.forEach((size, i) => {
      gl.enableVertexAttribArray(i)
      gl.vertexAttribPointer(i, size, gl.FLOAT, false, stride, offset)
      offset += size * 4
    })
    if (indexed) {
      const ib = gl.createBuffer()
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib)
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexed, gl.STATIC_DRAW)
    }
    gl.bindVertexArray(null)
    return { vao, buffer }
  }

  const flatArrays = arrays([2, 4])
  const pointArrays = arrays([2, 4, 1])
  const quad = arrays([2])
  gl.bindBuffer(gl.ARRAY_BUFFER, quad.buffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
    gl.STATIC_DRAW,
  )

  /** 格子の紙。頂点ごとに 位置 3、uv 2、熱 1、法線 3 */
  const createMesh = (index: Uint16Array, count: number): SheetMesh => ({
    ...arrays([3, 2, 1, 3], index),
    data: new Float32Array(count * 9),
    count: index.length,
  })

  const fillMesh = (
    mesh: SheetMesh,
    pos: Float32Array,
    uv: Float32Array,
    heat: Float32Array,
    normal: Float32Array,
  ) => {
    const { data } = mesh
    const n = pos.length / 3
    for (let i = 0; i < n; i++) {
      const o = i * 9
      data[o] = pos[i * 3]
      data[o + 1] = pos[i * 3 + 1]
      data[o + 2] = pos[i * 3 + 2]
      data[o + 3] = uv[i * 2]
      data[o + 4] = uv[i * 2 + 1]
      data[o + 5] = heat[i]
      data[o + 6] = normal[i * 3]
      data[o + 7] = normal[i * 3 + 1]
      data[o + 8] = normal[i * 3 + 2]
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
  }

  const begin = (width: number, height: number) => {
    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
  }
  const normalBlend = () => gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  const addBlend = () => gl.blendFunc(gl.ONE, gl.ONE)

  const drawSheet = (
    mesh: SheetMesh,
    matrix: Float32Array,
    texture: WebGLTexture | null,
    o: {
      w: number
      h: number
      seam: [number, number, number]
      part: number
      stretch: number
      shade: number
      edge: number
      fire: [number, number, number]
      time: number
    },
  ) => {
    normalBlend()
    gl.useProgram(sheet.program)
    gl.uniformMatrix4fv(sheet.u('uMatrix'), false, matrix)
    gl.uniform2f(sheet.u('uSize'), o.w, o.h)
    gl.uniform3f(sheet.u('uSeam'), ...o.seam)
    gl.uniform1f(sheet.u('uPart'), o.part)
    gl.uniform1f(sheet.u('uStretch'), o.stretch)
    gl.uniform1f(sheet.u('uShade'), o.shade)
    gl.uniform1f(sheet.u('uEdge'), o.edge)
    gl.uniform4f(sheet.u('uFire'), o.fire[0], o.fire[1], o.fire[2], 0)
    gl.uniform1f(sheet.u('uTime'), o.time)
    gl.uniform1i(sheet.u('uTex'), 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.bindVertexArray(mesh.vao)
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0)
  }

  /** canvas の px の三角を、頂点ごとの色（premultiplied）で描く。灰と紙の繊維 */
  const drawFlat = (
    data: Float32Array,
    count: number,
    w: number,
    h: number,
  ) => {
    if (!count) return
    normalBlend()
    gl.useProgram(flat.program)
    gl.uniform2f(flat.u('uSize'), w, h)
    gl.bindVertexArray(flatArrays.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, flatArrays.buffer)
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * 6), gl.DYNAMIC_DRAW)
    gl.drawArrays(gl.TRIANGLES, 0, count)
  }

  /** ぼけた丸。火の粉は加算、煙はふつうに重ねる */
  const drawPoints = (
    data: Float32Array,
    count: number,
    w: number,
    h: number,
    dpr: number,
    additive: boolean,
    soft: number,
  ) => {
    if (!count) return
    if (additive) addBlend()
    else normalBlend()
    gl.useProgram(point.program)
    gl.uniform2f(point.u('uSize'), w, h)
    gl.uniform1f(point.u('uDpr'), dpr)
    gl.uniform1f(point.u('uSoft'), soft)
    gl.bindVertexArray(pointArrays.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, pointArrays.buffer)
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * 7), gl.DYNAMIC_DRAW)
    gl.drawArrays(gl.POINTS, 0, count)
  }

  const drawFlame = (
    rect: [number, number, number, number],
    w: number,
    h: number,
    time: number,
    power: number,
    gain = 1,
  ) => {
    addBlend()
    gl.useProgram(flame.program)
    gl.uniform1f(flame.u('uGain'), gain)
    gl.uniform4f(flame.u('uRect'), ...rect)
    gl.uniform2f(flame.u('uSize'), w, h)
    gl.uniform1f(flame.u('uTime'), time)
    gl.uniform1f(flame.u('uPower'), power)
    gl.bindVertexArray(quad.vao)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  const drawGlow = (
    x: number,
    y: number,
    w: number,
    h: number,
    power: number,
  ) => {
    addBlend()
    gl.useProgram(glow.program)
    gl.uniform4f(glow.u('uRect'), 0, 0, w, h)
    gl.uniform2f(glow.u('uSize'), w, h)
    gl.uniform2f(glow.u('uCenter'), x, y)
    gl.uniform1f(glow.u('uPower'), power)
    gl.bindVertexArray(quad.vao)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  return {
    createMesh,
    fillMesh,
    begin,
    drawSheet,
    drawFlat,
    drawPoints,
    drawFlame,
    drawGlow,
  }
}
