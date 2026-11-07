import { loop, onResize, pixelRatio } from '../../shared/dom'
import { touchGate } from '../../shared/touch'

const stage = document.querySelector<HTMLElement>('.stage')!
const canvas = stage.querySelector<HTMLCanvasElement>('canvas.cloth')!
const sheet = canvas.querySelector<HTMLElement>('.sheet')!
const counter = sheet.querySelector('output')!
const heavy = sheet.querySelector<HTMLInputElement>('.check input')!

sheet.querySelector('button')!.addEventListener('click', () => {
  counter.value = String(Number(counter.value) + 1)
})

const gl = canvas.getContext('webgl2', {
  antialias: true,
  premultipliedAlpha: true,
})
const supported =
  canvas.content === 'drawable' && !!gl && 'texElementSubImage2D' in gl

if (!supported) {
  // 使えないブラウザでは canvas の子は描かれない。外に出してふつうの HTML として見せる
  stage.classList.add('is-flat')
  // drawable のままだと、対応している版では canvas を通さないと描かれない
  sheet.removeAttribute('drawable')
  stage.append(sheet)
  canvas.remove()
  // showFallback は画面を覆うので使わず、カードの下に一行添える
  const note = document.createElement('p')
  note.className = 'flat-note'
  note.textContent =
    'この環境では HTML-in-Canvas が使えないので、ふつうの HTML のまま置いています'
  stage.append(note)
} else {
  start(gl!)
}

function start(gl: WebGL2RenderingContext) {
  // 布の格子。横の分割数を決め、縦は布の縦横比から決める
  const COLS = 24
  // 透視の強さ（画面から目までの距離、px）
  const FOCAL = 1400
  // つまんだ点を持ち上げる高さ（px）。引っぱった距離で LIFT_MAX まで上げる
  const LIFT = 40
  const LIFT_MAX = 130

  let W = 0
  let H = 0
  let sheetW = 0
  let sheetH = 0
  let originX = 0
  let originY = 0
  let rows = 0
  let count = 0
  let cell = 0

  let pos = new Float32Array(0)
  let prev = new Float32Array(0)
  let rest = new Float32Array(0)
  let uv = new Float32Array(0)
  let index = new Uint16Array(0)
  let constraints: { a: number; b: number; len: number; k: number }[] = []

  const vertexData = () => new Float32Array(count * 9)
  let vbo = new Float32Array(0)
  let shadowVbo = new Float32Array(0)

  const build = () => {
    rows = Math.max(2, Math.round((COLS * sheetH) / sheetW))
    count = (COLS + 1) * (rows + 1)
    cell = sheetW / COLS
    pos = new Float32Array(count * 3)
    prev = new Float32Array(count * 3)
    rest = new Float32Array(count * 2)
    uv = new Float32Array(count * 2)
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= COLS; i++) {
        const n = j * (COLS + 1) + i
        const x = originX + (i / COLS) * sheetW
        const y = originY + (j / rows) * sheetH
        rest[n * 2] = x
        rest[n * 2 + 1] = y
        pos[n * 3] = prev[n * 3] = x
        pos[n * 3 + 1] = prev[n * 3 + 1] = y
        pos[n * 3 + 2] = prev[n * 3 + 2] = 0
        uv[n * 2] = i / COLS
        uv[n * 2 + 1] = j / rows
      }
    }
    const tris: number[] = []
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < COLS; i++) {
        const a = j * (COLS + 1) + i
        const b = a + 1
        const c = a + COLS + 1
        const d = c + 1
        tris.push(a, c, b, b, c, d)
      }
    }
    index = new Uint16Array(tris)
    constraints = []
    const link = (a: number, b: number, k: number) => {
      const dx = rest[a * 2] - rest[b * 2]
      const dy = rest[a * 2 + 1] - rest[b * 2 + 1]
      constraints.push({ a, b, len: Math.hypot(dx, dy), k })
    }
    const id = (i: number, j: number) => j * (COLS + 1) + i
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= COLS; i++) {
        if (i < COLS) link(id(i, j), id(i + 1, j), 1)
        if (j < rows) link(id(i, j), id(i, j + 1), 1)
        if (i < COLS && j < rows) {
          link(id(i, j), id(i + 1, j + 1), 1)
          link(id(i + 1, j), id(i, j + 1), 1)
        }
        // 1 つ飛ばしのつなぎが折れにくさ。k は毎フレーム布の重さで替える
        if (i < COLS - 1) link(id(i, j), id(i + 2, j), -1)
        if (j < rows - 1) link(id(i, j), id(i, j + 2), -1)
        if (i < COLS - 1 && j < rows - 1) {
          link(id(i, j), id(i + 2, j + 2), -1)
          link(id(i + 2, j), id(i, j + 2), -1)
        }
      }
    }
    vbo = vertexData()
    shadowVbo = vertexData()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW)
    awake = true
  }

  // --- 物理 ---------------------------------------------------------------

  let grabbed = -1
  let grabX = 0
  let grabY = 0
  let grabRestX = 0
  let grabRestY = 0
  let lift = 0
  let awake = true

  const STEP = 1 / 120
  let acc = 0

  const simulate = (dt: number) => {
    const isHeavy = heavy.checked
    const gravity = isHeavy ? 5200 : 2600
    const bend = isHeavy ? 0.6 : 0.22
    acc += dt
    let moved = 0
    while (acc >= STEP) {
      acc -= STEP
      // 遠くへ引っぱるほど高く持ち上げる。内へ寄せたとき、潰れずに折り返る
      const target =
        grabbed >= 0
          ? Math.min(
              LIFT_MAX,
              LIFT + Math.hypot(grabX - grabRestX, grabY - grabRestY) * 0.35,
            )
          : 0
      lift += (target - lift) * 0.08
      for (let n = 0; n < count; n++) {
        const p = n * 3
        const x = pos[p]
        const y = pos[p + 1]
        const z = pos[p + 2]
        const onTable = z <= 0.01
        // 机に触れている所は摩擦で止まり、元の場所へ強く戻る。浮いた所は自由に動き、ゆっくり戻る
        const damp = onTable ? 0.7 : 0.985
        const home = onTable ? 90 : 18
        const vx = (x - prev[p]) * damp
        const vy = (y - prev[p + 1]) * damp
        const vz = (z - prev[p + 2]) * 0.985
        prev[p] = x
        prev[p + 1] = y
        prev[p + 2] = z
        const ax = (rest[n * 2] - x) * home
        const ay = (rest[n * 2 + 1] - y) * home
        pos[p] = x + vx + ax * STEP * STEP
        pos[p + 1] = y + vy + ay * STEP * STEP
        pos[p + 2] = z + vz - gravity * STEP * STEP
      }
      for (let it = 0; it < 10; it++) {
        for (const c of constraints) {
          const k = c.k < 0 ? bend : c.k
          const a = c.a * 3
          const b = c.b * 3
          const dx = pos[b] - pos[a]
          const dy = pos[b + 1] - pos[a + 1]
          const dz = pos[b + 2] - pos[a + 2]
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
          const f = ((d - c.len) / d) * 0.5 * k
          pos[a] += dx * f
          pos[a + 1] += dy * f
          pos[a + 2] += dz * f
          pos[b] -= dx * f
          pos[b + 1] -= dy * f
          pos[b + 2] -= dz * f
        }
        if (grabbed >= 0) {
          // つまんだ点は、画面の上でポインターの真下に見える高さと位置に置く
          const g = grabbed * 3
          const s = (FOCAL - lift) / FOCAL
          pos[g] = W / 2 + (grabX - W / 2) * s
          pos[g + 1] = H / 2 + (grabY - H / 2) * s
          pos[g + 2] = lift
        }
        for (let n = 0; n < count; n++) {
          if (pos[n * 3 + 2] < 0) pos[n * 3 + 2] = 0
        }
      }
    }
    for (let n = 0; n < count * 3; n++)
      moved = Math.max(moved, Math.abs(pos[n] - prev[n]))
    return moved
  }

  // 机の上に平らに置かれているか。平らなときだけ、HTML の当たり判定と見た目が重なる
  const isFlat = () => {
    for (let n = 0; n < count; n++) {
      if (
        Math.abs(pos[n * 3] - rest[n * 2]) > 2 ||
        Math.abs(pos[n * 3 + 1] - rest[n * 2 + 1]) > 2 ||
        pos[n * 3 + 2] > 2
      )
        return false
    }
    return true
  }

  // --- 描画 ---------------------------------------------------------------

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s)!)
    return s
  }
  const program = (vs: string, fs: string) => {
    const p = gl.createProgram()!
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs))
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(p)!)
    return p
  }

  // 頂点ごとに、画面の位置 xy、高さ z、uv、法線 xyz の 8 つ（+予備 1）
  const VS = /* glsl */ `#version 300 es
    layout(location = 0) in vec2 aPos;
    layout(location = 1) in float aZ;
    layout(location = 2) in vec2 aUv;
    layout(location = 3) in vec3 aNormal;
    uniform vec2 uSize;
    out vec2 vUv;
    out vec3 vNormal;
    out float vZ;
    void main() {
      vUv = aUv;
      vNormal = aNormal;
      vZ = aZ;
      vec2 clip = aPos / uSize * 2.0 - 1.0;
      gl_Position = vec4(clip.x, -clip.y, -aZ / 2000.0, 1.0);
    }`

  const SHEET_FS = /* glsl */ `#version 300 es
    precision highp float;
    in vec2 vUv;
    in vec3 vNormal;
    in float vZ;
    uniform sampler2D uTex;
    out vec4 outColor;
    void main() {
      vec3 n = normalize(vNormal);
      vec3 light = normalize(vec3(-0.35, -0.55, 1.0));
      if (!gl_FrontFacing) {
        // 裏返った所は布の裏の色
        float shade = 0.75 + 0.35 * abs(dot(n, light));
        outColor = vec4(vec3(0.86, 0.84, 0.79) * shade, 1.0);
        return;
      }
      vec4 tex = texture(uTex, vUv);
      // 平らなときは 1 になるようにして、もとの HTML の色をそのまま出す
      float shade = clamp(1.0 + 0.7 * (dot(n, light) - light.z), 0.6, 1.08);
      vec3 h = normalize(light + vec3(0.0, 0.0, 1.0));
      float sheen = pow(max(dot(n, h), 0.0), 40.0) - pow(h.z, 40.0);
      outColor = vec4(tex.rgb * shade + max(sheen, 0.0) * 0.25 * tex.a, tex.a);
    }`

  const SHADOW_FS = /* glsl */ `#version 300 es
    precision highp float;
    in vec2 vUv;
    in vec3 vNormal;
    in float vZ;
    out vec4 outColor;
    void main() {
      // 持ち上がった所ほど影はぼけて薄くなる。端のぼけ幅を高さで広げる
      float blur = 0.01 + vZ / 3000.0;
      vec2 e = smoothstep(vec2(0.0), vec2(blur), vUv) * smoothstep(vec2(0.0), vec2(blur), 1.0 - vUv);
      float a = e.x * e.y * mix(0.32, 0.12, clamp(vZ / 120.0, 0.0, 1.0));
      outColor = vec4(0.0, 0.0, 0.0, a);
    }`

  const sheetProgram = program(VS, SHEET_FS)
  const shadowProgram = program(VS, SHADOW_FS)
  const ibo = gl.createBuffer()
  const buffer = gl.createBuffer()
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  const STRIDE = 9 * 4
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE, 0)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, STRIDE, 8)
  gl.enableVertexAttribArray(2)
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, STRIDE, 12)
  gl.enableVertexAttribArray(3)
  gl.vertexAttribPointer(3, 3, gl.FLOAT, false, STRIDE, 20)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)

  const texture = gl.createTexture()
  let texW = 0
  let texH = 0
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  const project = (x: number, y: number, z: number) => {
    const s = FOCAL / (FOCAL - z)
    return [W / 2 + (x - W / 2) * s, H / 2 + (y - H / 2) * s]
  }

  const fillVertices = () => {
    const at = (i: number, j: number) => {
      i = Math.min(COLS, Math.max(0, i))
      j = Math.min(rows, Math.max(0, j))
      return (j * (COLS + 1) + i) * 3
    }
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= COLS; i++) {
        const n = j * (COLS + 1) + i
        const p = n * 3
        // 法線は左右と上下の点の差から
        const l = at(i - 1, j)
        const r = at(i + 1, j)
        const u = at(i, j - 1)
        const d = at(i, j + 1)
        const tx = pos[r] - pos[l]
        const ty = pos[r + 1] - pos[l + 1]
        const tz = pos[r + 2] - pos[l + 2]
        const bx = pos[d] - pos[u]
        const by = pos[d + 1] - pos[u + 1]
        const bz = pos[d + 2] - pos[u + 2]
        let nx = ty * bz - tz * by
        let ny = tz * bx - tx * bz
        let nz = tx * by - ty * bx
        const nl = Math.hypot(nx, ny, nz) || 1
        nx /= nl
        ny /= nl
        nz /= nl
        const z = pos[p + 2]
        const [sx, sy] = project(pos[p], pos[p + 1], z)
        const o = n * 9
        vbo[o] = sx
        vbo[o + 1] = sy
        vbo[o + 2] = z
        vbo[o + 3] = uv[n * 2]
        vbo[o + 4] = uv[n * 2 + 1]
        vbo[o + 5] = nx
        vbo[o + 6] = ny
        vbo[o + 7] = nz
        // 影は左上からの光で、高さに比例して右下へずらし、机の上に落とす
        shadowVbo[o] = pos[p] + 3 + z * 0.35
        shadowVbo[o + 1] = pos[p + 1] + 5 + z * 0.55
        shadowVbo[o + 2] = z
        shadowVbo[o + 3] = uv[n * 2]
        shadowVbo[o + 4] = uv[n * 2 + 1]
      }
    }
  }

  const render = () => {
    fillVertices()
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.bindVertexArray(vao)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    gl.disable(gl.DEPTH_TEST)
    gl.useProgram(shadowProgram)
    gl.uniform2f(gl.getUniformLocation(shadowProgram, 'uSize'), W, H)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, shadowVbo, gl.DYNAMIC_DRAW)
    // 影は premultiplied で出したいので、色 0 のまま alpha だけを効かせる
    gl.drawElements(gl.TRIANGLES, index.length, gl.UNSIGNED_SHORT, 0)

    gl.enable(gl.DEPTH_TEST)
    gl.useProgram(sheetProgram)
    gl.uniform2f(gl.getUniformLocation(sheetProgram, 'uSize'), W, H)
    gl.uniform1i(gl.getUniformLocation(sheetProgram, 'uTex'), 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.bufferData(gl.ARRAY_BUFFER, vbo, gl.DYNAMIC_DRAW)
    gl.drawElements(gl.TRIANGLES, index.length, gl.UNSIGNED_SHORT, 0)
  }

  // --- HTML を写す ---------------------------------------------------------

  // 布の中身（入力、フォーカス、チェック）が変わるたびに paint が来る。そのときだけテクスチャを写し直す
  canvas.addEventListener('paint', () => {
    const size = canvas.getElementImageDefaultSize(sheet)
    const w = Math.ceil(size.width)
    const h = Math.ceil(size.height)
    if (!w || !h) return
    gl.bindTexture(gl.TEXTURE_2D, texture)
    if (w !== texW || h !== texH) {
      texW = w
      texH = h
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        w,
        h,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      )
    }
    gl.texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, sheet)
    awake = true
  })

  // HTML の当たり判定を、机の上に置いたときの布の位置に合わせる
  const placeHitArea = () => {
    canvas.updateElementGeometry(sheet, {
      canvasTransform: new DOMMatrix().translate(originX, originY),
    })
  }

  const layout = () => {
    const rect = canvas.getBoundingClientRect()
    W = rect.width
    H = rect.height
    const dpr = pixelRatio()
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    sheet.style.width = `${Math.min(340, W - 32)}px`
    sheetW = sheet.offsetWidth
    sheetH = sheet.offsetHeight
    originX = (W - sheetW) / 2
    originY = (H - sheetH) / 2
    build()
    placeHitArea()
    canvas.requestPaint()
  }
  onResize(canvas, layout)
  onResize(sheet, () => {
    if (sheet.offsetHeight !== sheetH && W) layout()
  })

  // --- つまむ -------------------------------------------------------------

  const local = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }

  // 画面の上でいちばん近い格子の点。布から離れすぎていたら -1
  const pick = (x: number, y: number) => {
    let best = -1
    let bestD = cell * 1.5
    for (let n = 0; n < count; n++) {
      const [sx, sy] = project(pos[n * 3], pos[n * 3 + 1], pos[n * 3 + 2])
      const d = Math.hypot(sx - x, sy - y)
      if (d < bestD) {
        bestD = d
        best = n
      }
    }
    return best
  }

  const INTERACTIVE = 'input, button, label, a, select, textarea'

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    const target = e.target as Element
    // 平らに置かれているときは、欄やボタンはふつうに使える。それ以外の所をつまむ
    if (isFlat() && target.closest(INTERACTIVE)) return
    const [x, y] = local(e)
    const n = pick(x, y)
    if (n < 0) return
    // フォーカスを動かさない。欄に書きかけのまま布をつまんでも、打った文字が布に写り続ける
    e.preventDefault()
    grabbed = n
    grabX = x
    grabY = y
    grabRestX = rest[n * 2]
    grabRestY = rest[n * 2 + 1]
    awake = true
    stage.setPointerCapture(e.pointerId)
    stage.classList.add('is-grabbing')
  })
  stage.addEventListener('pointermove', (e) => {
    if (grabbed < 0) return
    ;[grabX, grabY] = local(e)
  })
  const release = () => {
    grabbed = -1
    stage.classList.remove('is-grabbing')
  }
  stage.addEventListener('pointerup', release)
  stage.addEventListener('pointercancel', release)
  heavy.addEventListener('change', () => (awake = true))
  touchGate(stage)

  loop((dt) => {
    if (!awake || !count || !texW) return
    const moved = simulate(dt)
    render()
    if (grabbed < 0 && moved < 0.001 && lift < 0.01) awake = false
  })
}
