import { createProgram } from '../../shared/html-canvas'
import { BETA, R } from './peel'

// 格子の目の大きさ（px）。筒の半周（約 40px）を 8 つほどに分けられる細かさ
const CELL = 5

const VS = /* glsl */ `#version 300 es
  layout(location = 0) in vec2 aPos;
  uniform vec2 uHalf;
  uniform vec2 uCenter;
  uniform vec2 uRot;
  uniform float uScale;
  uniform vec2 uSize;
  uniform float uFocal;
  uniform vec2 uP0;
  uniform vec2 uDir;
  uniform float uFold;
  uniform float uLayer;
  uniform int uMode;
  out vec2 vUv;
  out vec3 vNormal;
  out float vZ;
  const float R = ${R.toFixed(1)};
  const float WRAP = ${(Math.PI - BETA).toFixed(5)};

  vec2 turn(vec2 v) {
    return vec2(uRot.x * v.x - uRot.y * v.y, uRot.y * v.x + uRot.x * v.y);
  }

  void main() {
    // u は折り目から、めくれる側（P0 の側）への向き。s は折り目からの距離
    vec2 u = -uDir;
    vec2 fold = uP0 + uDir * uFold;
    float s = dot(aPos - fold, u);
    vec2 p = aPos;
    float z = 0.0;
    vec3 n = vec3(0.0, 0.0, 1.0);
    if (uFold > 0.0 && s > 0.0) {
      vec2 base = aPos - u * s;
      if (s < WRAP * R) {
        float t = s / R;
        p = base + u * R * sin(t);
        z = R * (1.0 - cos(t));
        n = vec3(-sin(t) * u, cos(t));
      } else {
        // 巻き終わった先は、その向きのまままっすぐ伸ばす
        float rest = s - WRAP * R;
        p = base + u * (R * sin(WRAP) + cos(WRAP) * rest);
        z = R * (1.0 - cos(WRAP)) + sin(WRAP) * rest;
        n = vec3(-sin(WRAP) * u, cos(WRAP));
      }
    }
    vec2 world = uCenter + turn((p - uHalf) * uScale);
    float zw = z * uScale;
    vUv = aPos / (uHalf * 2.0);
    vNormal = vec3(turn(n.xy), n.z);
    vZ = zw;
    vec2 screen;
    float depth;
    if (uMode == 0) {
      // CSS の perspective と同じく、持ち上がった所ほど画面の中心から外へ広がる
      screen = uSize * 0.5 + (world - uSize * 0.5) * uFocal / (uFocal - zw);
      depth = zw + uLayer;
    } else {
      // 影は左上からの光で、高さに比例して右下へずらし、箱の面に落とす
      screen = world + vec2(0.6, 1.0) + vec2(0.35, 0.55) * zw;
      depth = uLayer + 0.1;
    }
    vec2 clip = screen / uSize * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, -depth / 4000.0, 1.0);
  }`

const FS = /* glsl */ `#version 300 es
  precision highp float;
  precision highp int;
  in vec2 vUv;
  in vec3 vNormal;
  in float vZ;
  uniform sampler2D uTex;
  uniform int uMode;
  out vec4 outColor;
  void main() {
    vec4 tex = texture(uTex, vUv);
    if (uMode == 1) {
      // 貼ってある所の縁にだけ出る、紙の厚みの影
      float a = 0.2 * (1.0 - smoothstep(0.0, 2.0, vZ)) * tex.a;
      if (a < 0.003) discard;
      outColor = vec4(0.0, 0.0, 0.0, a);
      return;
    }
    if (uMode == 2) {
      // 持ち上がった所の影。高いほど薄く、縁がぼける
      float blur = 0.01 + vZ / 2500.0;
      vec2 e = smoothstep(vec2(0.0), vec2(blur), vUv) * smoothstep(vec2(0.0), vec2(blur), 1.0 - vUv);
      float a = smoothstep(0.5, 8.0, vZ) * mix(0.36, 0.14, clamp(vZ / 140.0, 0.0, 1.0)) * e.x * e.y * tex.a;
      if (a < 0.003) discard;
      outColor = vec4(0.0, 0.0, 0.0, a);
      return;
    }
    if (tex.a < 0.02) discard;
    vec3 n = normalize(vNormal);
    vec3 light = normalize(vec3(-0.35, -0.55, 1.0));
    if (n.z < 0.0) {
      // 裏返った所は、台紙から剥がしたままの白
      float shade = clamp(1.0 + 0.3 * (dot(-n, light) - light.z), 0.82, 1.04);
      outColor = vec4(vec3(0.95, 0.94, 0.91) * shade * tex.a, tex.a);
      return;
    }
    // 平らなときは 1 になるようにして、もとの HTML の色をそのまま出す
    float shade = clamp(1.0 + 0.6 * (dot(n, light) - light.z), 0.5, 1.08);
    vec3 h = normalize(light + vec3(0.0, 0.0, 1.0));
    float sheen = max(pow(max(dot(n, h), 0.0), 30.0) - pow(h.z, 30.0), 0.0);
    outColor = vec4(tex.rgb * shade + sheen * 0.3 * tex.a, tex.a);
  }`

export interface Placement {
  w: number
  h: number
  cx: number
  cy: number
  rot: number
  scale: number
  layer: number
}

export interface Peel {
  p0x: number
  p0y: number
  dx: number
  dy: number
  fold: number
}

export const createRenderer = (gl: WebGL2RenderingContext) => {
  const { program, u } = createProgram(gl, VS, FS)

  const createMesh = (w: number, h: number) => {
    const cols = Math.max(2, Math.ceil(w / CELL))
    const rows = Math.max(2, Math.ceil(h / CELL))
    const pos = new Float32Array((cols + 1) * (rows + 1) * 2)
    for (let j = 0; j <= rows; j++)
      for (let i = 0; i <= cols; i++) {
        const n = (j * (cols + 1) + i) * 2
        pos[n] = (i / cols) * w
        pos[n + 1] = (j / rows) * h
      }
    const index = new Uint16Array(cols * rows * 6)
    let k = 0
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const a = j * (cols + 1) + i
        const b = a + 1
        const c = a + cols + 1
        const d = c + 1
        index.set([a, c, b, b, c, d], k)
        k += 6
      }
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    const vbo = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    const ibo = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW)
    gl.bindVertexArray(null)
    return {
      vao,
      count: index.length,
      dispose() {
        gl.deleteBuffer(vbo)
        gl.deleteBuffer(ibo)
        gl.deleteVertexArray(vao)
      },
    }
  }

  type Mesh = ReturnType<typeof createMesh>

  const begin = (width: number, height: number, focal: number) => {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.clearColor(0, 0, 0, 0)
    gl.clearDepth(1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT)
    gl.useProgram(program)
    gl.uniform2f(u('uSize'), width, height)
    gl.uniform1f(u('uFocal'), focal)
    gl.uniform1i(u('uTex'), 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
  }

  /** 1 枚を、縁の影、シール、持ち上がった所の影の順に描く */
  const draw = (
    mesh: Mesh,
    texture: WebGLTexture,
    at: Placement,
    peel: Peel,
  ) => {
    gl.bindVertexArray(mesh.vao)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform2f(u('uHalf'), at.w / 2, at.h / 2)
    gl.uniform2f(u('uCenter'), at.cx, at.cy)
    gl.uniform2f(u('uRot'), Math.cos(at.rot), Math.sin(at.rot))
    gl.uniform1f(u('uScale'), at.scale)
    gl.uniform1f(u('uLayer'), at.layer)
    gl.uniform2f(u('uP0'), peel.p0x, peel.p0y)
    gl.uniform2f(u('uDir'), peel.dx, peel.dy)
    gl.uniform1f(u('uFold'), peel.fold)

    gl.depthMask(false)
    gl.uniform1i(u('uMode'), 1)
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0)

    gl.depthMask(true)
    gl.uniform1i(u('uMode'), 0)
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0)

    if (peel.fold <= 0) return
    // 筒の所と伸びた所の影が重なって濃くならないよう、1 つの画素には 1 回だけ描く
    gl.depthMask(false)
    gl.clear(gl.STENCIL_BUFFER_BIT)
    gl.enable(gl.STENCIL_TEST)
    gl.stencilFunc(gl.EQUAL, 0, 0xff)
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR)
    gl.uniform1i(u('uMode'), 2)
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0)
    gl.disable(gl.STENCIL_TEST)
    gl.depthMask(true)
  }

  return { createMesh, begin, draw }
}
