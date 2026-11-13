import { createProgram } from '../../shared/html-canvas'
import { type Center, type Stroke, tipAt } from './stroke'

const VS = /* glsl */ `#version 300 es
  layout(location=0) in vec2 aPos;
  layout(location=1) in vec2 aLocal;
  layout(location=2) in float aRadius;
  layout(location=3) in float aS;
  layout(location=4) in float aCircle;
  uniform vec2 uSize;
  uniform vec2 uOffset;
  out vec2 vLocal;
  out float vRadius;
  out float vS;
  flat out float vCircle;
  void main() {
    vec2 p = (aPos + uOffset) / uSize * 2.0 - 1.0;
    gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
    vLocal = aLocal;
    vRadius = aRadius;
    vS = aS;
    vCircle = aCircle;
  }`
const FS = /* glsl */ `#version 300 es
  precision highp float;
  in vec2 vLocal;
  in float vRadius;
  in float vS;
  flat in float vCircle;
  uniform float uLimit;
  uniform vec4 uColor;
  out vec4 outColor;
  void main() {
    if (vS > uLimit) discard;
    float d = (vCircle > 0.5 ? length(vLocal) : abs(vLocal.x)) - vRadius;
    float aa = max(fwidth(d), 0.0001);
    float a = 1.0 - smoothstep(-aa * 0.5, aa * 0.5, d);
    outColor = uColor * a;
  }`
const QUAD = /* glsl */ `#version 300 es
  out vec2 vUv;
  void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    vUv = p;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }`
const COMPOSITE = /* glsl */ `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uMask;
  uniform vec3 uPaper;
  uniform vec3 uInk;
  uniform float uOpacity;
  out vec4 outColor;
  void main() {
    float a = texture(uMask, vUv).r * uOpacity;
    outColor = vec4(mix(uPaper, uInk, a), 1.0);
  }`

export const createRenderer = (gl: WebGL2RenderingContext) => {
  const line = createProgram(gl, VS, FS)
  const composite = createProgram(gl, QUAD, COMPOSITE)
  const mask = gl.createTexture()!
  const target = gl.createFramebuffer()!
  gl.bindTexture(gl.TEXTURE_2D, mask)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.bindFramebuffer(gl.FRAMEBUFFER, target)
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    mask,
    0,
  )

  const buffer = () => {
    const vao = gl.createVertexArray()
    const vbo = gl.createBuffer()
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    for (const [i, size, offset] of [
      [0, 2, 0],
      [1, 2, 2],
      [2, 1, 4],
      [3, 1, 5],
      [4, 1, 6],
    ]) {
      gl.enableVertexAttribArray(i)
      gl.vertexAttribPointer(i, size, gl.FLOAT, false, 28, offset * 4)
    }
    return {
      vao,
      vbo,
      count: 0,
      set(data: number[], dynamic = false) {
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array(data),
          dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW,
        )
        this.count = data.length / 7
      },
      dispose() {
        gl.deleteBuffer(vbo)
        gl.deleteVertexArray(vao)
      },
    }
  }
  const tip = buffer()
  let padding = 1

  const circle = (data: number[], [x, y, width, s]: Center, extra = 0) => {
    const r = width / 2 + extra
    const edge = r + padding
    for (const [a, b] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ])
      data.push(x + a * edge, y + b * edge, a * edge, b * edge, r, s, 1)
  }

  const createMesh = (stroke: Stroke) => {
    const data: number[] = []
    const points = stroke.centers
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]
      const b = points[i]
      const length = b[3] - a[3]
      const nx = -(b[1] - a[1]) / length
      const ny = (b[0] - a[0]) / length
      for (const [p, side] of [
        [a, -1],
        [b, -1],
        [a, 1],
        [a, 1],
        [b, -1],
        [b, 1],
      ] as const) {
        const r = p[2] / 2
        const edge = side * (r + padding)
        data.push(p[0] + nx * edge, p[1] + ny * edge, edge, 0, r, p[3], 0)
      }
    }
    for (const p of points) circle(data, p)
    const mesh = buffer()
    mesh.set(data)
    return { ...mesh, stroke }
  }

  const resize = (width: number, height: number, dpr: number) => {
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array
    const max = Math.min(
      gl.getParameter(gl.MAX_TEXTURE_SIZE),
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      ...viewport,
    )
    const ratio = Math.min(dpr, max / width, max / height)
    const canvas = gl.canvas as HTMLCanvasElement
    canvas.width = Math.max(1, Math.floor(width * ratio))
    canvas.height = Math.max(1, Math.floor(height * ratio))
    padding = 2 / Math.min(canvas.width / width, canvas.height / height)
    gl.bindTexture(gl.TEXTURE_2D, mask)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      canvas.width,
      canvas.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    )
    gl.bindFramebuffer(gl.FRAMEBUFFER, target)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error('線のマスクを作れなかった')
  }

  const draw = (
    mesh: ReturnType<typeof createMesh> | undefined,
    width: number,
    height: number,
    offset: number[],
    p: number,
    opacity: number,
    paper: number[],
    ink: number[],
    tipColor: number[],
  ) => {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.bindFramebuffer(gl.FRAMEBUFFER, target)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(line.program)
    gl.uniform2f(line.u('uSize'), width, height)
    gl.uniform2fv(line.u('uOffset'), offset)
    gl.enable(gl.BLEND)
    // 色を混ぜる前の被覆率に MAX を使い、縁も交差部も描画回数で濃くしない
    gl.blendEquation(gl.MAX)
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.uniform4f(line.u('uColor'), 1, 1, 1, 1)
    if (p > 0 && mesh?.stroke.length) {
      gl.uniform1f(line.u('uLimit'), p * mesh.stroke.length)
      gl.bindVertexArray(mesh.vao)
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count)
    }
    gl.disable(gl.BLEND)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.bindVertexArray(null)
    gl.useProgram(composite.program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, mask)
    gl.uniform1i(composite.u('uMask'), 0)
    gl.uniform3fv(composite.u('uPaper'), paper)
    gl.uniform3fv(composite.u('uInk'), ink)
    gl.uniform1f(composite.u('uOpacity'), opacity)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    // 先端は合成済みの線の上に描き、交差部でも白を保つ
    if (p > 0 && p < 1 && mesh?.stroke.length) {
      const data: number[] = []
      const point = tipAt(mesh.stroke, p)
      circle(data, [point[0], point[1], point[2], 0], 1.5)
      tip.set(data, true)
      gl.useProgram(line.program)
      gl.uniform1f(line.u('uLimit'), 1)
      gl.uniform4f(
        line.u('uColor'),
        tipColor[0],
        tipColor[1],
        tipColor[2],
        opacity,
      )
      gl.enable(gl.BLEND)
      gl.blendEquation(gl.FUNC_ADD)
      // シェーダーで色にも被覆率を掛けているため、乗算済みの色として混ぜる
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.bindVertexArray(tip.vao)
      gl.drawArrays(gl.TRIANGLES, 0, tip.count)
      gl.disable(gl.BLEND)
    }
  }
  return { createMesh, resize, draw }
}
