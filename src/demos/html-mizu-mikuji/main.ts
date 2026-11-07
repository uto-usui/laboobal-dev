import { isHoverless, loop, onResize, pixelRatio } from '../../shared/dom'
import {
  clipMatrix,
  createProgram,
  elementTexture,
  htmlCanvasGl,
  perspective,
  showFlatFallback,
} from '../../shared/html-canvas'
import { onReducedMotion } from '../../shared/motion'
import { pointerOrWander, trackPointer } from '../../shared/pointer'
import { FORTUNES, fillSlip } from './fortunes'
import {
  BASIN_FS,
  PART_FS,
  QUAD_VS,
  ROPE_VS,
  SHADOW_FS,
  SLIP_FS,
  STONE_FS,
  STRIP_FS,
} from './shaders'
import { Water } from './water'

const stage = document.querySelector<HTMLElement>('.stage')!
const canvas = stage.querySelector<HTMLCanvasElement>('canvas.view')!
const rope = canvas.querySelector<HTMLElement>('.rope')!
const slipEls = [...canvas.querySelectorAll<HTMLElement>('.slip')]
const sign = canvas.querySelector<HTMLElement>('.sign')!
const box = canvas.querySelector<HTMLButtonElement>('.box')!
const flowerEls = [...canvas.querySelectorAll<HTMLElement>('.camellia')]

/** 今どの札がどのみくじか。引き直すときに同じものが並ばないようにする */
const showing = slipEls.map(() => -1)
// 今さっき納めたみくじも、続けては出さない
let removed = -1
const pickFortune = () => {
  const free = FORTUNES.map((_, i) => i).filter(
    (i) => !showing.includes(i) && i !== removed,
  )
  return free[Math.floor(Math.random() * free.length)]
}
slipEls.forEach((el, i) => {
  showing[i] = pickFortune()
  fillSlip(el, FORTUNES[showing[i]])
})

const gl = htmlCanvasGl(canvas)
if (gl) start(gl)
else showFlatFallback(canvas, slipEls, stage)

function start(gl: WebGL2RenderingContext) {
  const COLUMNS = 96
  // いちばん傾けたときの角度（度）
  const MAX_TILT = 14
  // 真上から少し手前に倒して見る角度（度）
  const BASE_PITCH = 16
  const DEPTH = 1500
  // 上の注連縄のための高さ（px）
  const ROPE_SPACE = 60
  const ROPE_SAG = 10
  // おみくじ 1 枚の、ひたり具合を数える列の数
  const SC = 48
  // 水から出ている幅がこれより狭ければ、押せないことにする（px）
  const MIN_DRY = 22
  const SUBSTEP = 1 / 300

  type State = 'in' | 'away'
  interface Slot {
    el: HTMLElement
    row: number
    x: number
    y: number
    state: State
    soak: Float32Array
    wet: Float32Array
    dry: boolean
  }
  const slots: Slot[] = slipEls.map((el, row) => ({
    el,
    row,
    x: 0,
    y: 0,
    state: 'in',
    soak: new Float32Array(SC),
    wet: new Float32Array(SC),
    dry: true,
  }))
  let count = 3
  const active = () => slots.slice(0, count)

  interface Flower {
    el: HTMLElement
    x: number
    y: number
    vx: number
    vy: number
    a: number
    r: number
  }
  const flowers: Flower[] = flowerEls.map((el) => ({
    el,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    a: Math.random() * 6,
    r: 28,
  }))

  interface Rect {
    x: number
    y: number
    w: number
    h: number
    a: number
  }
  interface Flight {
    slot: Slot
    kind: 'tie' | 'keep' | 'draw'
    t: number
    dur: number
    from: Rect
    to: Rect
  }
  const flights: Flight[] = []
  const ties: { x: number; a: number; seed: number }[] = []

  const water = new Water(COLUMNS)
  let W = 0
  let H = 0
  let BW = 0
  let BH = 0
  let slipW = 200
  let slipH = 252
  const inner = { x: 0, y: 0, w: 0, h: 0 }
  const at = new Map<
    HTMLElement,
    { x: number; y: number; w: number; h: number }
  >()
  let fit = 1
  let cx = 0
  let cy = 0
  let ropeLen = 0

  let roll = 0
  let rollVel = 0
  let pitch = 0
  let flow = 0
  let reduced = false
  let dirty = true
  let shake = 0
  let lastMatrix = new DOMMatrix()

  // ---- WebGL ----
  const stoneProgram = createProgram(gl, QUAD_VS, STONE_FS)
  const slipProgram = createProgram(gl, QUAD_VS, SLIP_FS)
  const partProgram = createProgram(gl, QUAD_VS, PART_FS)
  const shadowProgram = createProgram(gl, QUAD_VS, SHADOW_FS)
  const basinProgram = createProgram(gl, QUAD_VS, BASIN_FS)
  const stripProgram = createProgram(gl, QUAD_VS, STRIP_FS)
  const ropeProgram = createProgram(gl, ROPE_VS, PART_FS)

  const quad = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
    gl.STATIC_DRAW,
  )
  const quadVao = gl.createVertexArray()
  gl.bindVertexArray(quadVao)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

  const ROPE_SEGMENTS = 40
  const ropeVerts = new Float32Array((ROPE_SEGMENTS + 1) * 4)
  for (let i = 0; i <= ROPE_SEGMENTS; i++) {
    const t = i / ROPE_SEGMENTS
    ropeVerts.set([t, 0, t, 1], i * 4)
  }
  const ropeVao = gl.createVertexArray()
  gl.bindVertexArray(ropeVao)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, ropeVerts, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)

  const floatTexture = (width: number, height: number) => {
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      width,
      height,
      0,
      gl.RGBA,
      gl.FLOAT,
      null,
    )
    return tex
  }
  const waterData = new Float32Array(COLUMNS * 4)
  const waterTex = floatTexture(COLUMNS, 1)
  const mapData = new Float32Array(SC * slots.length * 4)
  const mapTex = floatTexture(SC, slots.length)

  // 水盤を、水盤の座標のまま描いておく。水はこれをずらして読む
  const sceneTex = gl.createTexture()
  const sceneFbo = gl.createFramebuffer()
  let sceneW = 1
  let sceneH = 1
  const sizeScene = () => {
    const dpr = pixelRatio()
    sceneW = Math.max(1, Math.round(BW * dpr * fit))
    sceneH = Math.max(1, Math.round(BH * dpr * fit))
    gl.bindTexture(gl.TEXTURE_2D, sceneTex)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      sceneW,
      sceneH,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    )
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo)
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      sceneTex,
      0,
    )
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  const textures = new Map(
    [rope, ...slipEls, sign, box, ...flowerEls].map((el) => [
      el,
      elementTexture(gl, canvas, el),
    ]),
  )
  const needed = () => [rope, ...active().map((s) => s.el), sign, box]
  canvas.addEventListener('paint', (e) => {
    const changed = (e as Event & { changedElements?: Element[] })
      .changedElements
    // 札の角の透けた所を、ブレンドに合わせて premultiplied で受け取る。float のテクスチャには付けない（付けると転送が失敗する）
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    for (const [el, tex] of textures) {
      if (el.hidden) continue
      if (!changed || changed.includes(el) || !tex.ready) tex.upload()
    }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    dirty = true
  })

  // ---- 大きさと置き方 ----
  const basinMatrix = (r = roll, p = pitch) =>
    new DOMMatrix()
      .translate(cx, cy)
      .scale(fit, fit)
      .multiply(perspective(DEPTH))
      .rotate(BASE_PITCH + p, 0, 0)
      .rotate(0, r * (180 / Math.PI), 0)
      .translate(-BW / 2, -BH / 2)

  onResize(canvas, ({ width, height }) => {
    W = width
    H = height
    const dpr = pixelRatio()
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)

    const narrow = W < 560
    count = narrow ? 2 : 3
    slipEls[2].hidden = narrow
    const rim = narrow ? 14 : 18
    const gap = narrow ? 8 : 12
    const ledge = 44
    if (narrow) {
      BW = Math.min(W - 28, 440)
      slipW = Math.floor((BW - 2 * rim - 3 * gap) / 2)
      slipH = Math.max(220, Math.min(300, H - ROPE_SPACE - ledge - 70))
    } else {
      slipW = 208
      slipH = 252
      BW = 3 * slipW + 4 * gap + 2 * rim
    }
    inner.x = rim
    inner.y = rim
    inner.w = BW - 2 * rim
    inner.h = slipH + 2 * gap
    BH = rim + inner.h + ledge

    for (const s of slots) {
      s.el.style.width = `${slipW}px`
      s.el.style.height = `${slipH}px`
      s.x = rim + gap + s.row * (slipW + gap)
      s.y = rim + gap
      at.set(s.el, { x: s.x, y: s.y, w: slipW, h: slipH })
      s.el.classList.toggle('tabs-right', s.x + slipW / 2 > BW / 2 + 1)
    }
    sign.style.width = `${Math.min(300, BW - 2 * rim - box.offsetWidth - 16)}px`
    const ledgeY = rim + inner.h + ledge / 2
    at.set(sign, {
      x: rim + 2,
      y: ledgeY - sign.offsetHeight / 2,
      w: sign.offsetWidth,
      h: sign.offsetHeight,
    })
    at.set(box, {
      x: BW - rim - 2 - box.offsetWidth,
      y: ledgeY - box.offsetHeight / 2,
      w: box.offsetWidth,
      h: box.offsetHeight,
    })
    rope.style.width = `${W - 16}px`
    ropeLen = W - 16

    water.resize(inner.w, 0.16)
    flowers.forEach((f, i) => {
      f.r = flowerEls[i].offsetWidth / 2
      f.x = inner.w * (i ? 0.56 : 0.44)
      f.y = inner.h * (i ? 0.7 : 0.3)
      f.vx = f.vy = 0
    })

    // いちばん傾けたときの見え方の外枠が、注連縄の下に収まる倍率にする
    fit = 1
    cx = 0
    cy = 0
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const r of [-1, 1])
      for (const p of [-3, 3]) {
        const m = basinMatrix((r * MAX_TILT * Math.PI) / 180, p)
        for (const [x, y] of [
          [0, 0],
          [BW, 0],
          [0, BH],
          [BW, BH],
        ]) {
          const q = m.transformPoint(new DOMPoint(x, y))
          x0 = Math.min(x0, q.x / q.w)
          x1 = Math.max(x1, q.x / q.w)
          y0 = Math.min(y0, q.y / q.w)
          y1 = Math.max(y1, q.y / q.w)
        }
      }
    const room = H - ROPE_SPACE - 12
    fit = Math.min(1, (W - 20) / (x1 - x0), room / (y1 - y0))
    cx = W / 2
    cy = ROPE_SPACE + (room - (y1 - y0) * fit) / 2 - y0 * fit
    sizeScene()
    dirty = true
    canvas.requestPaint()
  })

  // ---- 入力 ----
  const pointer = trackPointer(stage, { units: 'unit', leave: 'center' })
  // 指で触った所は、離してもしばらく傾けたままにする。すぐ勝手に揺れ出すと、押したい札が水に沈む
  let touchHold: { x: number; y: number; time: number } | undefined
  const onTouch = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return
    const r = stage.getBoundingClientRect()
    touchHold = {
      x: ((e.clientX - r.left) / r.width) * 2 - 1,
      y: ((e.clientY - r.top) / r.height) * 2 - 1,
      time: performance.now(),
    }
  }
  stage.addEventListener('pointerdown', onTouch)
  stage.addEventListener('pointermove', onTouch)
  onReducedMotion((r) => {
    reduced = r
    // 動きを減らす設定では、水面を揺らさずにすっと寄せる
    water.damping = r ? 9 : 1.6
    dirty = true
  })

  const project = (m: DOMMatrix, x: number, y: number) => {
    const q = m.transformPoint(new DOMPoint(x, y))
    return { x: q.x / q.w, y: q.y / q.w }
  }
  /** 水盤の上の四角が、画面のどこにどの大きさで見えているか */
  const screenRect = (x: number, y: number, w: number, h: number): Rect => {
    const m = lastMatrix
    const a = project(m, x, y)
    const b = project(m, x + w, y)
    const c = project(m, x, y + h)
    const d = project(m, x + w, y + h)
    return {
      x: (a.x + b.x + c.x + d.x) / 4,
      y: (a.y + b.y + c.y + d.y) / 4,
      w:
        (Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(d.x - c.x, d.y - c.y)) /
        2,
      h:
        (Math.hypot(c.x - a.x, c.y - a.y) + Math.hypot(d.x - b.x, d.y - b.y)) /
        2,
      a: Math.atan2(b.y - a.y, b.x - a.x),
    }
  }
  const ropeY = (x: number) => {
    const t = Math.min(Math.max((x - 8) / ropeLen, 0), 1)
    return 4 + 13 + ROPE_SAG * 4 * t * (1 - t)
  }
  const updateBox = () => {
    box.disabled = !active().some(
      (s) => s.state === 'away' && !flights.some((f) => f.slot === s),
    )
  }

  /** 次に結ぶ所。縄の真ん中から左右へ交互に、紙垂の所は避けて並べる */
  const tieSpot = () => {
    const shide = [0.18, 0.5, 0.82].map((t) => 8 + t * ropeLen)
    const spots: number[] = []
    for (let d = 0; d < ropeLen / 2 - 24; d += 17)
      for (const x of d ? [W / 2 + d, W / 2 - d] : [W / 2])
        if (shide.every((sx) => Math.abs(sx - x) > 16)) spots.push(x)
    const used = ties.length % Math.max(1, spots.length)
    return spots[used] ?? W / 2
  }

  for (const s of slots) {
    s.el.addEventListener('click', (e) => {
      const tab = (e.target as HTMLElement).closest('.tab')
      if (!tab || s.state !== 'in') return
      const kind = tab.classList.contains('tie') ? 'tie' : 'keep'
      const from = screenRect(s.x, s.y, slipW, slipH)
      let to: Rect
      if (kind === 'tie') {
        const x = tieSpot() + (Math.random() - 0.5) * 4
        to = {
          x,
          y: ropeY(x) - 4 + 22,
          w: 12,
          h: 44,
          a: (Math.random() - 0.5) * 0.16,
        }
      } else {
        to = {
          ...from,
          y: H + from.h,
          w: from.w * 1.15,
          h: from.h * 1.15,
          a: 0,
        }
      }
      s.state = 'away'
      s.el.inert = true
      flights.push({
        slot: s,
        kind,
        t: 0,
        dur: kind === 'tie' ? 1.1 : 0.8,
        from,
        to,
      })
      removed = showing[s.row]
      showing[s.row] = -1
      updateBox()
      dirty = true
    })
  }
  box.addEventListener('click', () => {
    shake = 0.45
    dirty = true
    const s = active().find(
      (o) => o.state === 'away' && !flights.some((f) => f.slot === o),
    )
    if (!s) return
    showing[s.row] = pickFortune()
    fillSlip(s.el, FORTUNES[showing[s.row]])
    s.soak.fill(0)
    s.wet.fill(0)
    const b = at.get(box)!
    const from = screenRect(
      b.x + b.w / 2 - slipW * 0.1,
      b.y,
      slipW * 0.2,
      slipH * 0.2,
    )
    flights.push({
      slot: s,
      kind: 'draw',
      t: 0,
      dur: 0.8,
      from,
      to: screenRect(s.x, s.y, slipW, slipH),
    })
    updateBox()
  })
  updateBox()

  // ---- 動き ----
  const stepFlowers = (dt: number) => {
    flowers.forEach((f, i) => {
      // 2 輪が同じ動きにならないよう、水への引かれ方を少し変える
      const grip = i ? 3.2 : 2.1
      // 花の端が水にかかっていれば、水に引かれてついていく。真ん中だけで見ると、引いていく水に置いていかれる
      const d = Math.max(
        water.depth(f.x - f.r * 0.8),
        water.depth(f.x),
        water.depth(f.x + f.r * 0.8),
      )
      if (d > 0.3) {
        // 流れに運ばれ、浅い所からは深い方へ引かれる（水が引くと一緒に寄っていく）
        const grad = (water.depth(f.x + 8) - water.depth(f.x - 8)) / 16
        f.vx += ((water.flow(f.x) - f.vx) * grip + grad * 2600) * dt
        f.vy -= f.vy * 2 * dt
      } else {
        const k = Math.exp(-8 * dt)
        f.vx *= k
        f.vy *= k
      }
      f.x += f.vx * dt
      f.y += f.vy * dt
      f.a += (f.vx / f.r) * 0.35 * dt
      f.x = Math.min(Math.max(f.x, f.r), inner.w - f.r)
      f.y = Math.min(Math.max(f.y, f.r), inner.h - f.r)
    })
    const [a, b] = flowers
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.hypot(dx, dy)
    const min = a.r + b.r - 6
    if (dist < min && dist > 0) {
      const push = (min - dist) / 2
      const nx = dx / dist
      const ny = dy / dist
      a.x -= nx * push
      a.y -= ny * push
      b.x += nx * push
      b.y += ny * push
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
      if (rel < 0) {
        a.vx += rel * nx * 0.6
        a.vy += rel * ny * 0.6
        b.vx -= rel * nx * 0.6
        b.vy -= rel * ny * 0.6
      }
    }
  }

  // 水の下でまだ文字が出きっていない札があるか。静まっても、出きるまではループを止めない
  let soaking = false
  const soakSlips = (dt: number) => {
    soaking = false
    for (const s of active()) {
      if (s.state !== 'in') continue
      for (let c = 0; c < SC; c++) {
        const x = s.x + ((c + 0.5) / SC) * slipW - inner.x
        if (water.depth(x) > 0.35) {
          if (s.soak[c] < 1.6) soaking = true
          s.soak[c] = Math.min(1.6, s.soak[c] + dt * (reduced ? 40 : 0.75))
          s.wet[c] = 1
        } else s.wet[c] = Math.max(0, s.wet[c] - dt / 3.5)
      }
    }
  }

  /** 札のうち水の上に出ている、いちばん長いひと続きの幅（列の範囲） */
  const dryRun = (s: Slot) => {
    let best = [0, 0]
    let start = -1
    for (let c = 0; c <= SC; c++) {
      const dry =
        c < SC && water.depth(s.x + ((c + 0.5) / SC) * slipW - inner.x) <= 0.35
      if (dry && start < 0) start = c
      if (!dry && start >= 0) {
        if (c - start > best[1] - best[0]) best = [start, c]
        start = -1
      }
    }
    return best
  }

  const flowerMatrix = (m: DOMMatrix, f: Flower) =>
    m
      .translate(inner.x + f.x, inner.y + f.y)
      .rotate(0, 0, f.a * (180 / Math.PI))
      .translate(-f.r, -f.r)

  // 当たり判定は、変わったときだけ渡し直す。canvasClip を渡すと、変わっていなくてもその要素の paint が来るため
  const placed = new Map<HTMLElement, string>()
  const place = (el: HTMLElement, m?: DOMMatrix, clip?: DOMRectInit) => {
    const key = m ? `${m}${clip ? JSON.stringify(clip) : ''}` : ''
    if (placed.get(el) === key) return
    placed.set(el, key)
    if (!m) canvas.clearElementGeometry(el)
    else
      canvas.updateElementGeometry(el, {
        canvasTransform: m,
        ...(clip && { canvasClip: clip }),
      })
  }

  const updateHits = (m: DOMMatrix) => {
    for (const s of slots) {
      if (s.state !== 'in' || s.el.hidden || slots.indexOf(s) >= count) {
        place(s.el)
        continue
      }
      const [a, b] = dryRun(s)
      const width = ((b - a) / SC) * slipW
      // 境目で押せる・押せないが行ったり来たりしないよう、水から出たとみなすのは、少し余分に出てからにする
      const dry = width >= MIN_DRY + (s.dry ? 0 : 10)
      if (dry !== s.dry) {
        s.dry = dry
        s.el.inert = !dry
        if (!dry && s.el.contains(document.activeElement))
          (document.activeElement as HTMLElement).blur()
      }
      const base = m.translate(s.x, s.y)
      if (!dry) place(s.el)
      else if (b - a === SC) place(s.el, base)
      else
        place(s.el, base, {
          x: (a / SC) * slipW,
          y: 0,
          width,
          height: slipH,
        })
    }
    for (const el of [sign, box]) {
      const p = at.get(el)!
      place(el, m.translate(p.x, p.y))
    }
    for (const f of flowers) place(f.el, flowerMatrix(m, f))
    place(rope)
  }

  // ---- 描く ----
  type Program = ReturnType<typeof createProgram>
  const setQuad = (p: Program, m: DOMMatrix, w: number, h: number) => {
    gl.useProgram(p.program)
    gl.uniformMatrix4fv(p.u('uMatrix'), false, m.toFloat32Array())
    gl.uniform2f(p.u('uSize'), w, h)
  }
  const bindTex = (
    p: Program,
    name: string,
    unit: number,
    tex: WebGLTexture | null,
  ) => {
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.uniform1i(p.u(name), unit)
  }
  const setWater = (p: Program, unit: number) => {
    bindTex(p, 'uWater', unit, waterTex)
    gl.uniform1f(p.u('uDx'), water.dx)
  }
  const shadowAt = (
    m: DOMMatrix,
    w: number,
    h: number,
    blur: number,
    alpha: number,
  ) => {
    setQuad(shadowProgram, m, w, h)
    gl.uniform1f(shadowProgram.u('uBlur'), blur)
    gl.uniform1f(shadowProgram.u('uAlpha'), alpha)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
  const drawSlip = (m: DOMMatrix, s: Slot, fold: number, alpha: number) => {
    const tex = textures.get(s.el)!
    if (!tex.ready) return
    setQuad(slipProgram, m, slipW, slipH)
    bindTex(slipProgram, 'uTex', 0, tex.texture)
    bindTex(slipProgram, 'uMaps', 1, mapTex)
    gl.uniform1i(slipProgram.u('uRow'), s.row)
    gl.uniform1f(slipProgram.u('uFold'), fold)
    gl.uniform1f(slipProgram.u('uAlpha'), alpha)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
  const drawPart = (m: DOMMatrix, el: HTMLElement, w: number, h: number) => {
    const tex = textures.get(el)!
    if (!tex.ready) return
    setQuad(partProgram, m, w, h)
    bindTex(partProgram, 'uTex', 0, tex.texture)
    gl.uniform1f(partProgram.u('uAlpha'), 1)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  const ease = (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
  const flightRect = (f: Flight): Rect => {
    const e = ease(Math.min(f.t, 1))
    const r = {
      x: f.from.x + (f.to.x - f.from.x) * e,
      y: f.from.y + (f.to.y - f.from.y) * e,
      w: f.from.w + (f.to.w - f.from.w) * e,
      h: f.from.h + (f.to.h - f.from.h) * e,
      a: f.from.a + (f.to.a - f.from.a) * e,
    }
    // 結びに行くときは、いったん持ち上げてから縄へ
    if (f.kind === 'tie') r.y -= Math.sin(Math.PI * e) * 40
    return r
  }
  const rectMatrix = (clip: DOMMatrix, r: Rect, w: number, h: number) =>
    clip
      .translate(r.x, r.y)
      .rotate(0, 0, r.a * (180 / Math.PI))
      .scale(r.w / w, r.h / h)
      .translate(-w / 2, -h / 2)

  const draw = (m: DOMMatrix) => {
    for (let i = 0; i < COLUMNS; i++) {
      waterData[i * 4] = water.h[i]
      waterData[i * 4 + 1] = water.bed[i]
      waterData[i * 4 + 2] = water.wet[i]
    }
    gl.bindTexture(gl.TEXTURE_2D, waterTex)
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      COLUMNS,
      1,
      gl.RGBA,
      gl.FLOAT,
      waterData,
    )
    for (const s of slots)
      for (let c = 0; c < SC; c++) {
        const k = (s.row * SC + c) * 4
        mapData[k] = s.soak[c]
        mapData[k + 1] = s.wet[c]
      }
    gl.bindTexture(gl.TEXTURE_2D, mapTex)
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      SC,
      slots.length,
      gl.RGBA,
      gl.FLOAT,
      mapData,
    )

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.bindVertexArray(quadVao)

    // 1. 水盤の石、底の札、縁の立て札と御籤箱、花の影
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo)
    gl.viewport(0, 0, sceneW, sceneH)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    const ortho = clipMatrix(BW, BH)
    setQuad(stoneProgram, ortho, BW, BH)
    gl.uniform4f(stoneProgram.u('uInner'), inner.x, inner.y, inner.w, inner.h)
    setWater(stoneProgram, 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    for (const s of active()) {
      if (s.state !== 'in') continue
      shadowAt(ortho.translate(s.x - 2, s.y), slipW + 5, slipH + 5, 6, 0.3)
      drawSlip(ortho.translate(s.x, s.y), s, 0, 1)
    }
    for (const f of flowers) {
      const deep = water.depth(f.x) > 0.3 ? 1 : 0
      shadowAt(
        ortho.translate(
          inner.x + f.x - f.r + 2 + deep * 3,
          inner.y + f.y - f.r + 4 + deep * 4,
        ),
        f.r * 2,
        f.r * 2,
        f.r * 0.9,
        0.35,
      )
    }
    const sp = at.get(sign)!
    shadowAt(ortho.translate(sp.x - 1, sp.y + 1), sp.w + 3, sp.h + 4, 4, 0.4)
    drawPart(ortho.translate(sp.x, sp.y), sign, sp.w, sp.h)
    const bp = at.get(box)!
    const wobble = shake > 0 ? Math.sin(shake * 60) * 4 * shake : 0
    const boxM = ortho
      .translate(bp.x + bp.w / 2, bp.y + bp.h / 2)
      .rotate(0, 0, wobble)
      .translate(-bp.w / 2, -bp.h / 2)
    shadowAt(ortho.translate(bp.x - 1, bp.y + 2), bp.w + 3, bp.h + 4, 5, 0.45)
    drawPart(boxM, box, bp.w, bp.h)

    // 2. 画面へ
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clear(gl.COLOR_BUFFER_BIT)
    const clip = clipMatrix(W, H)
    const screen = clip.multiply(m)
    shadowAt(screen.translate(-6, 10), BW + 14, BH + 10, 34, 0.55)

    setQuad(basinProgram, screen, BW, BH)
    bindTex(basinProgram, 'uScene', 0, sceneTex)
    setWater(basinProgram, 1)
    gl.uniform4f(basinProgram.u('uInner'), inner.x, inner.y, inner.w, inner.h)
    gl.uniform1f(basinProgram.u('uEq'), Math.tan(roll))
    gl.uniform1f(basinProgram.u('uFlow'), flow)
    gl.uniform1f(basinProgram.u('uEnergy'), Math.min(water.energy / 30, 1))
    gl.uniform1f(basinProgram.u('uRoll'), roll)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    for (const f of flowers)
      drawPart(flowerMatrix(screen, f), f.el, f.r * 2, f.r * 2)

    for (const f of flights) {
      const r = flightRect(f)
      const e = ease(Math.min(f.t, 1))
      const fold = f.kind === 'tie' ? Math.min(1, e * 1.6) : 0
      const alpha = f.kind === 'keep' ? 1 - Math.max(0, (e - 0.5) * 2) : 1
      drawSlip(rectMatrix(clip, r, slipW, slipH), f.slot, fold, alpha)
    }

    const ropeTex = textures.get(rope)!
    if (ropeTex.ready) {
      gl.bindVertexArray(ropeVao)
      setQuad(ropeProgram, clip.translate(8, 4), ropeLen, rope.offsetHeight)
      gl.uniform1f(ropeProgram.u('uSag'), ROPE_SAG)
      bindTex(ropeProgram, 'uTex', 0, ropeTex.texture)
      gl.uniform1f(ropeProgram.u('uAlpha'), 1)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, (ROPE_SEGMENTS + 1) * 2)
      gl.bindVertexArray(quadVao)
    }

    // 結んだ札は縄に巻きつくので、縄より手前に描く
    for (const t of ties) {
      const tm = clip
        .translate(t.x, ropeY(t.x) - 4)
        .rotate(0, 0, t.a * (180 / Math.PI))
        .translate(-6, 0)
      setQuad(stripProgram, tm, 12, 44)
      gl.uniform1f(stripProgram.u('uSeed'), t.seed)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
  }

  // ---- ループ ----
  let wanderTime = 0
  loop((dt) => {
    // 最初の paint で大きさが 0 のまま写せなかった要素があれば、もう一度頼む
    if (needed().some((el) => !textures.get(el)!.ready)) {
      canvas.requestPaint()
      return
    }
    if (!BW) return
    let p: { x: number; y: number } = pointerOrWander(pointer, wanderTime, 0.5)
    const holding =
      touchHold && performance.now() - touchHold.time < 4000 && isHoverless()
    if (holding) p = touchHold!
    else if (isHoverless() && !pointer.inside && !reduced) wanderTime += dt
    // 水盤の端より少し内側で、いちばん傾く
    const nx = Math.max(-1, Math.min(1, (p.x * W) / (BW * fit * 0.8)))
    const ny = Math.max(-1, Math.min(1, (p.y * H) / (BH * fit)))
    // 手のある側が持ち上がり、水は反対へ寄る
    const target = -nx * MAX_TILT * (Math.PI / 180)
    const pitchTarget = ny * 3

    const settled =
      !dirty &&
      Math.abs(target - roll) < 1e-4 &&
      Math.abs(rollVel) < 1e-4 &&
      Math.abs(pitchTarget - pitch) < 0.01 &&
      water.energy < 0.3 &&
      flights.length === 0 &&
      shake === 0 &&
      !soaking &&
      flowers.every((f) => Math.abs(f.vx) + Math.abs(f.vy) < 0.3) &&
      water.wet.every((w) => w === 0 || w === 1) &&
      active().every((s) => s.wet.every((w) => w === 0 || w === 1))
    if (settled) return
    dirty = false

    const steps = Math.max(1, Math.ceil(dt / Math.min(SUBSTEP, water.maxStep)))
    const h = dt / steps
    for (let i = 0; i < steps; i++) {
      rollVel += (60 * (target - roll) - 13 * rollVel) * h
      roll += rollVel * h
      water.step(h, roll)
      stepFlowers(h)
    }
    water.dry(dt)
    soakSlips(dt)
    pitch += (pitchTarget - pitch) * (1 - Math.exp(-dt * 6))
    shake = Math.max(0, shake - dt)
    if (!reduced) flow += dt * Math.min(water.energy / 25, 1.5)

    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i]
      f.t += dt / f.dur
      if (f.t < 1) continue
      flights.splice(i, 1)
      if (f.kind === 'tie')
        ties.push({ x: f.to.x, a: f.to.a, seed: Math.random() })
      if (f.kind === 'draw') {
        f.slot.state = 'in'
        f.slot.dry = false
      }
      updateBox()
    }

    const m = basinMatrix()
    lastMatrix = m
    // 引いた札の行き先は、傾きが変わっても札の場所に着くよう毎フレーム取り直す
    for (const f of flights)
      if (f.kind === 'draw') f.to = screenRect(f.slot.x, f.slot.y, slipW, slipH)
    updateHits(m)
    draw(m)
  })

  if (import.meta.env.DEV)
    Object.assign(window, {
      __mikuji: {
        water,
        slots,
        flowers,
        ties,
        flights,
        state: () => ({ roll, fit, count, BW, BH }),
        /** 要素の中の点（px）が画面のどこに見えているか */
        project: (el: HTMLElement, x: number, y: number) => {
          const f = flowers.find((o) => o.el === el)
          const p = at.get(el)!
          const m = f
            ? flowerMatrix(lastMatrix, f)
            : lastMatrix.translate(p.x, p.y)
          const q = project(m, x, y)
          const r = canvas.getBoundingClientRect()
          return { x: r.left + q.x, y: r.top + q.y }
        },
        dryRun,
        /** 水盤の四隅が画面のどこに見えているか */
        corners: () =>
          [
            [0, 0],
            [BW, 0],
            [0, BH],
            [BW, BH],
          ].map(([x, y]) => project(lastMatrix, x, y)),
      },
    })
}
