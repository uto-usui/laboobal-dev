import { loop, onResize, pixelRatio } from '../../shared/dom'
import {
  clipMatrix,
  elementTexture,
  htmlCanvasGl,
  perspective,
  showFlatFallback,
} from '../../shared/html-canvas'
import { onReducedMotion } from '../../shared/motion'
import { touchGate } from '../../shared/touch'
import {
  burnSheet,
  createSheet,
  type Fire,
  nearest,
  type Sheet,
  stepSheet,
  updateNormals,
} from './paper'
import { createRenderer, type SheetMesh } from './render'

const stage = document.querySelector<HTMLElement>('.stage')!
const canvas = stage.querySelector<HTMLCanvasElement>('canvas.view')!
const first = canvas.querySelector<HTMLElement>('.slip')!
const pad = stage.querySelector<HTMLElement>('.pad')!

// 一束の枚数。使い切ると新しい束が置かれる
const BUNDLE = 8
// 短冊の上から、綴じ目でちぎれる線までの px
const TEAR_Y = 27

/** 字が欄に収まるよう、字を小さくしていく */
const fitText = (text: HTMLTextAreaElement) => {
  let size = 20
  text.style.fontSize = `${size}px`
  while (text.scrollWidth > text.clientWidth + 1 && size > 12) {
    size -= 1
    text.style.fontSize = `${size}px`
  }
}

/** 束の厚み。残りの枚数だけ紙の端を重ねる */
const showPad = (left: number) => {
  const layers: string[] = []
  for (let k = 1; k <= left; k++) {
    const y = k * 1.4
    layers.push(`0.5px ${y}px 0 #d9ceb6`, `0.5px ${y + 0.6}px 0 #8f8270`)
  }
  pad.style.boxShadow = layers.join(', ')
}

const gl = htmlCanvasGl(canvas)
if (gl) start(gl)
else flat()

/** 使えないブラウザ。短冊をふつうの HTML で置き、くべるボタンで字を消して半券を増やす */
function flat() {
  stage.classList.add('is-flat')
  const column = document.createElement('div')
  column.className = 'flat'
  stage.append(column)
  showFlatFallback(canvas, [first], column)
  const text = first.querySelector('textarea')!
  const stubs = document.createElement('p')
  stubs.className = 'flat-stubs'
  const burn = document.createElement('button')
  burn.type = 'button'
  burn.className = 'flat-burn'
  burn.textContent = 'くべる'
  column.append(burn, stubs)
  let count = 0
  text.addEventListener('input', () => fitText(text))
  burn.addEventListener('click', () => {
    first.classList.add('is-burnt')
    window.setTimeout(() => {
      text.value = ''
      fitText(text)
      first.classList.remove('is-burnt')
      count++
      stubs.textContent = `焚き上げた短冊　${count} 枚`
    }, 600)
  })
}

function start(gl: WebGL2RenderingContext) {
  const FOCAL = 1400
  const GRAVITY = 1500
  // 綴じ目がこれだけ伸びたら破れる。すばやく引いたときは、少し伸びただけで破れる
  const TEAR_FAR = 30
  const TEAR_FAST = 6
  const TEAR_SPEED = 650
  // つまんだ点がもとの位置からこれだけ離れたら、どこをつまんでいても破れる。
  // 綴じ目の伸びだけで見ると、下の端を引いたときは紙が曲がるだけで綴じ目まで力が届かない
  const TEAR_PULL = 60

  interface Slip {
    el: HTMLElement
    text: HTMLTextAreaElement
    tex: ReturnType<typeof elementTexture>
    sheet: Sheet
    mesh: SheetMesh
    top?: SheetMesh
    state: 'pad' | 'free'
    seed: number
    stretch: number
    cutting?: { order: number[]; t: number }
    curl: number
    w: number
    h: number
  }
  interface Particle {
    x: number
    y: number
    vx: number
    vy: number
    a: number
    va: number
    size: number
    life: number
    max: number
    kind: 'ash' | 'ember' | 'smoke' | 'fiber' | 'flame'
    shade: number
  }

  const renderer = createRenderer(gl)
  const slips: Slip[] = []
  const particles: Particle[] = []
  const stubs: { seed: number; dy: number }[] = []
  let left = BUNDLE
  let W = 0
  let H = 0
  let reduced = false
  let awake = true
  let time = 0
  let power = 1
  let flare = 0

  const L = {
    slipX: 0,
    slipY: 0,
    slipW: 0,
    slipH: 0,
    groundY: 0,
    fireX: 0,
    coalY: 0,
    basketW: 0,
    flameW: 0,
    flameH: 0,
  }

  const fire = (): Fire => ({
    x: L.fireX,
    y: L.coalY,
    w: L.flameW * 0.9,
    h: L.flameH * 0.9 * power,
  })

  const floor = (x: number) =>
    Math.abs(x - L.fireX) < L.basketW * 0.42 ? L.coalY + 4 : L.groundY

  // --- 短冊 ------------------------------------------------------------------

  /** 短冊の上の、綴じ目から半券になる所までの小さな格子 */
  const topMesh = (s: Slip) => {
    const cols = 8
    const yMax = TEAR_Y + 6
    const pos: number[] = []
    const uv: number[] = []
    const index: number[] = []
    for (let j = 0; j <= 1; j++) {
      for (let i = 0; i <= cols; i++) {
        const lx = (i / cols) * s.w
        const ly = j * yMax
        pos.push(L.slipX + lx, L.slipY + ly, 0)
        uv.push(lx / s.w, ly / s.h)
      }
    }
    for (let i = 0; i < cols; i++)
      index.push(i, i + cols + 1, i + 1, i + 1, i + cols + 1, i + cols + 2)
    const mesh = renderer.createMesh(Uint16Array.from(index), pos.length / 3)
    const count = pos.length / 3
    const normal = new Float32Array(count * 3)
    for (let n = 0; n < count; n++) normal[n * 3 + 2] = 1
    renderer.fillMesh(
      mesh,
      Float32Array.from(pos),
      Float32Array.from(uv),
      new Float32Array(count),
      normal,
    )
    return mesh
  }

  const placeOnPad = (s: Slip) => {
    s.w = L.slipW
    s.h = L.slipH
    s.el.style.width = `${s.w}px`
    s.el.style.height = `${s.h}px`
    // 変換の候補の窓が短冊の横に出るよう、HTML の箱も描く位置に置く
    s.el.style.left = `${L.slipX}px`
    s.el.style.top = `${L.slipY}px`
    s.sheet = createSheet(s.w, s.h, TEAR_Y - 6, L.slipX, L.slipY)
    s.mesh = renderer.createMesh(s.sheet.index, s.sheet.count)
    s.top = topMesh(s)
    canvas.updateElementGeometry(s.el, {
      canvasTransform: new DOMMatrix().translate(L.slipX, L.slipY),
      canvasClip: { x: 0, y: TEAR_Y + 4, width: s.w, height: s.h - TEAR_Y - 4 },
    })
  }

  const addSlip = (el: HTMLElement) => {
    const text = el.querySelector('textarea')!
    text.addEventListener('input', () => fitText(text))
    text.addEventListener('keydown', (e) => {
      // Ctrl（Mac は ⌘）+ Enter で、ちぎって火へくべる
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        const s = slips.find((q) => q.el === el)
        if (s?.state === 'pad') offer(s)
      }
    })
    const s: Slip = {
      el,
      text,
      tex: elementTexture(gl, canvas, el),
      sheet: undefined as unknown as Sheet,
      mesh: undefined as unknown as SheetMesh,
      state: 'pad',
      seed: Math.random() * 100,
      stretch: 0,
      curl: Math.random() < 0.5 ? -1 : 1,
      w: 0,
      h: 0,
    }
    slips.push(s)
    if (W) placeOnPad(s)
    canvas.requestPaint()
    return s
  }

  const nextSlip = () => {
    left--
    if (left <= 0) left = BUNDLE
    showPad(left - 1)
    const el = first.cloneNode(true) as HTMLElement
    const text = el.querySelector('textarea')!
    text.value = ''
    text.readOnly = false
    text.style.fontSize = ''
    canvas.append(el)
    addSlip(el)
  }

  /** 綴じ目を、つかんだ列に近い方から順に切っていく */
  const startTear = (s: Slip, col: number) => {
    if (s.cutting) return
    const order = Array.from({ length: s.sheet.cols + 1 }, (_, i) => i).sort(
      (a, b) => Math.abs(a - col) - Math.abs(b - col),
    )
    s.cutting = { order, t: 0 }
  }

  const tearStep = (s: Slip, dt: number) => {
    const c = s.cutting
    if (!c) return
    c.t += dt
    while (c.order.length && c.t > 0.012) {
      c.t -= 0.012
      const i = c.order.shift()!
      s.sheet.anchored[i] = 0
      if (!reduced) {
        const x = s.sheet.pos[i * 3]
        const y = L.slipY + TEAR_Y
        for (let k = 0; k < 3; k++)
          spawn(
            'fiber',
            x,
            y,
            (Math.random() - 0.5) * 120,
            -40 - Math.random() * 120,
          )
      }
    }
    if (!c.order.length) {
      s.cutting = undefined
      s.state = 'free'
      // 指の位置はそのままで、短冊を上の端から吊るす。字が上向きのまま垂れ、下の端から火に入る
      if (grab?.slip === s && !grab.path) {
        const top = s.sheet.cols + 1 + Math.floor(s.sheet.cols / 2)
        grab.ox = s.sheet.pos[top * 3] - grab.x
        grab.oy = s.sheet.pos[top * 3 + 1] - grab.y
        grab.index = top
      }
      s.stretch = 0
      // ちぎった短冊は、もう書き直せない
      s.text.readOnly = true
      s.text.blur()
      canvas.clearElementGeometry(s.el)
      stubs.push({ seed: s.seed, dy: 0.5 + Math.random() * 2 })
      nextSlip()
    }
  }

  // --- 粒 --------------------------------------------------------------------

  const spawn = (
    kind: Particle['kind'],
    x: number,
    y: number,
    vx: number,
    vy: number,
  ) => {
    if (reduced || particles.length > 900) return
    const max =
      kind === 'smoke'
        ? 2.2 + Math.random() * 1.6
        : kind === 'ash'
          ? 2 + Math.random() * 2.5
          : kind === 'flame'
            ? 0.3 + Math.random() * 0.3
            : kind === 'ember'
              ? 0.9 + Math.random() * 1.2
              : 0.5 + Math.random() * 0.4
    particles.push({
      x,
      y,
      vx,
      vy,
      a: Math.random() * 6,
      va: (Math.random() - 0.5) * 10,
      size:
        kind === 'smoke'
          ? 14 + Math.random() * 12
          : kind === 'ash'
            ? 1.5 + Math.random() * 2.5
            : kind === 'flame'
              ? 5 + Math.random() * 5
              : kind === 'ember'
                ? 3 + Math.random() * 4
                : 1 + Math.random() * 2,
      life: 0,
      max,
      kind,
      shade: Math.random(),
    })
  }

  const stepParticles = (dt: number) => {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.life += dt
      if (p.life > p.max) {
        particles.splice(i, 1)
        continue
      }
      // 火の上は上昇気流。横へはゆらぐ
      const sway = Math.sin(time * 2.3 + p.shade * 20 + p.y * 0.02)
      if (p.kind === 'fiber') p.vy += 500 * dt
      else if (p.kind === 'ash') {
        p.vy += (-60 + p.life * 30) * dt
        p.vx += sway * 40 * dt
      } else if (p.kind === 'flame') {
        p.vy -= 260 * dt
        p.vx += sway * 60 * dt
        p.size *= Math.exp(-dt * 1.5)
      } else if (p.kind === 'ember') {
        p.vy -= 80 * dt
        p.vx += sway * 90 * dt
      } else {
        p.vy -= 10 * dt
        p.vx += sway * 12 * dt
        p.size += dt * 22
      }
      const drag = Math.exp(-dt * (p.kind === 'smoke' ? 0.8 : 1.6))
      p.vx *= drag
      p.vy *= drag
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.a += p.va * dt
    }
  }

  // --- つかむ ----------------------------------------------------------------

  interface Grab {
    slip: Slip
    index: number
    id: number
    x: number
    y: number
    vx: number
    vy: number
    t: number
    /** 指から、吊るしている点までのずれ */
    ox: number
    oy: number
    /** キーボードでくべるときは、指の代わりにこの道をたどる */
    path?: {
      from: { x: number; y: number }
      to: { x: number; y: number }
      t: number
    }
  }
  let grab: Grab | undefined

  const local = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    const target = e.target as Element
    const p = local(e)
    const padEl = target.closest<HTMLElement>('.slip')
    let slip: Slip | undefined
    let index = -1
    if (padEl) {
      // 欄は書くための所。短冊の足もとや縁をつかんで引く
      if (target.closest('textarea')) return
      slip = slips.find((s) => s.el === padEl && s.state === 'pad')
      if (slip) index = nearest(slip.sheet, p.x, p.y, 40)
    } else {
      for (const s of [...slips].reverse()) {
        if (s.state !== 'free') continue
        index = nearest(s.sheet, p.x, p.y, 26)
        if (index >= 0) {
          slip = s
          break
        }
      }
    }
    if (!slip || index < 0) return
    e.preventDefault()
    grab = {
      slip,
      index,
      id: e.pointerId,
      x: p.x,
      y: p.y,
      vx: 0,
      vy: 0,
      t: e.timeStamp,
      ox: 0,
      oy: 0,
    }
    // つかんだ短冊を手前に描く
    slips.splice(slips.indexOf(slip), 1)
    slips.push(slip)
    stage.setPointerCapture(e.pointerId)
    stage.classList.add('is-grabbing')
    awake = true
  })

  stage.addEventListener('pointermove', (e) => {
    if (!grab || e.pointerId !== grab.id) return
    const p = local(e)
    const dt = Math.max(0.001, (e.timeStamp - grab.t) / 1000)
    const k = 1 - Math.exp(-dt / 0.04)
    grab.vx += ((p.x - grab.x) / dt - grab.vx) * k
    grab.vy += ((p.y - grab.y) / dt - grab.vy) * k
    grab.x = p.x
    grab.y = p.y
    grab.t = e.timeStamp
    awake = true
  })

  const release = (e: PointerEvent) => {
    if (!grab || e.pointerId !== grab.id) return
    const s = grab.slip
    grab = undefined
    stage.classList.remove('is-grabbing')
    // 動きを減らす設定では、落ちる途中を見せず、落ちた所に置く
    if (reduced && s.state === 'free') settleFall(s)
    awake = true
  }
  stage.addEventListener('pointerup', release)
  stage.addEventListener('pointercancel', release)

  const settleFall = (s: Slip) => {
    s.sheet.prev.set(s.sheet.pos)
    for (let i = 0; i < 240; i++)
      stepSheet(s.sheet, 1 / 120, {
        gravity: GRAVITY,
        restore: 0,
        anchorK: 0,
        floor,
        left: 6,
        right: W - 6,
        curl: 0,
      })
  }

  /** キーボードでくべる。ちぎって、火の上まで運んで離す */
  const offer = (s: Slip) => {
    startTear(s, Math.floor(s.sheet.cols / 2))
    const index = 2 * (s.sheet.cols + 1) + Math.floor(s.sheet.cols / 2)
    const from = { x: s.sheet.pos[index * 3], y: s.sheet.pos[index * 3 + 1] }
    const to = { x: L.fireX, y: Math.max(20, L.coalY - L.flameH - 30) }
    grab = {
      slip: s,
      index,
      id: -1,
      x: from.x,
      y: from.y,
      vx: 0,
      vy: 0,
      t: 0,
      ox: 0,
      oy: 0,
      path: { from, to, t: 0 },
    }
    awake = true
  }

  // --- 動かす ----------------------------------------------------------------

  const step = (dt: number) => {
    if (grab?.path) {
      const g = grab
      const path = g.path!
      path.t = Math.min(1, path.t + dt / (reduced ? 0.05 : 1.1))
      const k =
        path.t < 0.5 ? 2 * path.t * path.t : 1 - (-2 * path.t + 2) ** 2 / 2
      const lift = Math.sin(path.t * Math.PI) * 60
      g.x = path.from.x + (path.to.x - path.from.x) * k
      g.y = path.from.y + (path.to.y - path.from.y) * k - lift
      if (path.t >= 1 && g.slip.state === 'free') {
        grab = undefined
        if (reduced) settleFall(g.slip)
      }
    }
    const f = fire()
    for (const s of slips) {
      const held = grab?.slip === s
      const onPad = s.state === 'pad'
      tearStep(s, dt)
      s.stretch = stepSheet(s.sheet, dt, {
        gravity: onPad ? 0 : GRAVITY,
        restore: onPad ? (held ? 0.004 : 0.25) : 0,
        anchorK: 0.35,
        floor,
        left: 6,
        right: W - 6,
        grab:
          held && grab
            ? { index: grab.index, x: grab.x + grab.ox, y: grab.y + grab.oy }
            : undefined,
        curl: reduced ? 0 : s.curl,
      })
      if (onPad && held && grab && !s.cutting) {
        const speed = Math.hypot(grab.vx, grab.vy)
        const { rest } = s.sheet
        const pulled = Math.hypot(
          grab.x + grab.ox - rest[grab.index * 2],
          grab.y + grab.oy - rest[grab.index * 2 + 1],
        )
        if (
          s.stretch > TEAR_FAR ||
          (s.stretch > TEAR_FAST && speed > TEAR_SPEED) ||
          pulled > TEAR_PULL
        )
          startTear(s, grab.index % (s.sheet.cols + 1))
      }
      if (onPad) continue
      const ended = burnSheet(s.sheet, dt, f, reduced ? 3 : 1)
      const { pos, heat, gone } = s.sheet
      for (const n of ended) {
        const x = pos[n * 3]
        const y = pos[n * 3 + 1]
        if (Math.random() < 0.5)
          spawn(
            'ash',
            x,
            y,
            (Math.random() - 0.5) * 40,
            -30 - Math.random() * 60,
          )
        if (Math.random() < 0.35)
          spawn(
            'ember',
            x,
            y,
            (Math.random() - 0.5) * 40,
            -60 - Math.random() * 80,
          )
      }
      let burning = 0
      for (let n = 0; n < s.sheet.count; n++) {
        if (gone[n] || heat[n] < 0.5) continue
        burning++
        // 燃え際に、紙そのものの小さな炎
        if (heat[n] > 0.72 && Math.random() < dt * 2.5)
          spawn(
            'flame',
            pos[n * 3] + (Math.random() - 0.5) * 6,
            pos[n * 3 + 1],
            0,
            -40,
          )
        if (Math.random() < dt * 0.9)
          spawn(
            'smoke',
            pos[n * 3],
            pos[n * 3 + 1] - 6,
            (Math.random() - 0.5) * 10,
            -30 - Math.random() * 20,
          )
      }
      if (burning) power = Math.max(power, 1 + Math.min(0.4, burning / 120))
      // 掴んでいた所まで燃えたら、手から落ちる
      if (held && grab && gone[grab.index]) grab = undefined
    }
    for (let i = slips.length - 1; i >= 0; i--) {
      const s = slips[i]
      if (s.state !== 'free') continue
      let alive = 0
      for (let n = 0; n < s.sheet.count; n++) if (!s.sheet.gone[n]) alive++
      if (alive < 4) {
        s.el.remove()
        gl.deleteTexture(s.tex.texture)
        slips.splice(i, 1)
        flare = 1
      }
    }
    power += (1 - power) * (1 - Math.exp(-dt * 0.8))
    flare *= Math.exp(-dt * 2.5)
    // 動きを減らす設定では、火の明るさを揺らさない
    if (reduced) {
      power = 1
      flare = 0
    }
  }

  /** 火のついた所か、炎の中に入っている所があるか */
  const inFire = (s: Slip) => {
    const f = fire()
    const { pos, heat, gone } = s.sheet
    for (let n = 0; n < s.sheet.count; n++) {
      if (gone[n]) continue
      if (heat[n] >= 0.5) return true
      const above = f.y - pos[n * 3 + 1]
      if (Math.abs(pos[n * 3] - f.x) < f.w / 2 && above > -16 && above < f.h)
        return true
    }
    return false
  }

  // --- 描く ------------------------------------------------------------------

  const flatData = new Float32Array(6 * 3 * 1200)
  const pointData = new Float32Array(7 * 1500)

  const render = () => {
    const dpr = pixelRatio()
    renderer.begin(canvas.width, canvas.height)
    const view = new DOMMatrix()
      .translate(W / 2, H / 2)
      .multiply(perspective(FOCAL))
      .translate(-W / 2, -H / 2)
    const matrix = clipMatrix(W, H).multiply(view)
    const flicker = reduced
      ? 1
      : 0.86 + 0.08 * Math.sin(time * 11.3) + 0.06 * Math.sin(time * 23.7 + 1.3)
    const heatLight = (power + flare * 0.4) * flicker
    renderer.drawGlow(L.fireX, L.coalY - L.flameH * 0.35, W, H, heatLight)

    const fireUniform: [number, number, number] = [
      L.fireX,
      L.coalY - L.flameH * 0.4,
      heatLight,
    ]
    const draw = (
      s: Slip,
      mesh: SheetMesh,
      m: DOMMatrix,
      part: number,
      seed: number,
      edge: number,
      shade = 1,
    ) =>
      renderer.drawSheet(mesh, m.toFloat32Array(), s.tex.texture, {
        w: s.w,
        h: s.h,
        seam: [TEAR_Y, 2.6, seed],
        part,
        stretch: Math.min(1, s.stretch / 14),
        shade,
        edge,
        fire: fireUniform,
        time,
      })

    const flame = (gain: number) => {
      const flameH = L.flameH * (power + flare * 0.5)
      renderer.drawFlame(
        [
          L.fireX - L.flameW / 2,
          L.coalY - flameH,
          L.flameW,
          flameH + L.basketW * 0.12,
        ],
        W,
        H,
        reduced ? 3.2 : time,
        1,
        gain,
      )
    }
    flame(1)

    for (const s of slips) {
      if (!s.tex.ready) continue
      updateNormals(s.sheet)
      renderer.fillMesh(
        s.mesh,
        s.sheet.pos,
        s.sheet.uv,
        s.sheet.heat,
        s.sheet.normal,
      )
      if (s.state === 'pad' && s.top) {
        draw(s, s.top, matrix, 1, s.seed, 0)
        draw(s, s.mesh, matrix, 0, s.seed, 0)
        // 前にちぎった短冊の半券。古いものほど手前にある
        for (
          let i = stubs.length - 1;
          i >= Math.max(0, stubs.length - 14);
          i--
        ) {
          const k = stubs.length - 1 - i
          // 古い半券ほど上に残り、少し焼けた色になる
          draw(
            s,
            s.top,
            matrix.translate(0, stubs[i].dy - k * 1.3, 0),
            1,
            stubs[i].seed,
            1,
            0.97 - k * 0.012,
          )
        }
      } else draw(s, s.mesh, matrix, 0, s.seed, 1)
    }

    // 灰と紙の繊維
    let count = 0
    const tri = (
      x: number,
      y: number,
      a: number,
      size: number,
      rgba: number[],
    ) => {
      if (count + 3 > flatData.length / 6) return
      for (const [t, r] of [
        [0, 1],
        [2.3, 0.6],
        [4.2, 0.9],
      ]) {
        flatData.set(
          [
            x + Math.cos(a + t) * size * r,
            y + Math.sin(a + t) * size * r,
            ...rgba,
          ],
          count * 6,
        )
        count++
      }
    }
    for (const p of particles) {
      const fade = 1 - p.life / p.max
      if (p.kind === 'ash') {
        // 燃えたての灰は、縁が少し赤い
        const hot = Math.max(0, 1 - p.life * 1.5)
        const g = 0.13 + p.shade * 0.16
        const a = Math.min(1, fade * 1.4) * 0.9
        tri(p.x, p.y, p.a, p.size, [
          (g + hot * 0.6) * a,
          (g + hot * 0.2) * a,
          g * a,
          a,
        ])
      } else if (p.kind === 'fiber') {
        tri(p.x, p.y, p.a, p.size, [
          0.85 * fade,
          0.82 * fade,
          0.76 * fade,
          fade,
        ])
      }
    }
    renderer.drawFlat(flatData, count, W, H)

    const points = (
      kind: Particle['kind'],
      color: (p: Particle, fade: number) => number[],
    ) => {
      let n = 0
      for (const p of particles) {
        if (p.kind !== kind || n >= 1500) continue
        const fade = 1 - p.life / p.max
        pointData.set([p.x, p.y, ...color(p, fade), p.size], n * 7)
        n++
      }
      return n
    }
    const smoke = points('smoke', (_, fade) => {
      const a = Math.sin(fade * Math.PI) * 0.06
      return [0.32 * a, 0.31 * a, 0.3 * a, a]
    })
    renderer.drawPoints(pointData, smoke, W, H, dpr, false, 1.6)

    // 紙の手前にも、薄く炎を重ねる。濃く重ねると、燃えていく字が見えない
    flame(0.35)

    const licks = points('flame', (_, fade) => {
      const k = fade * 0.4
      return [1 * k, 0.42 * k, 0.1 * k, 0]
    })
    renderer.drawPoints(pointData, licks, W, H, dpr, true, 1.4)
    const embers = points('ember', (p, fade) => {
      const k = fade * (0.6 + 0.4 * Math.sin(time * 20 + p.shade * 40))
      return [1 * k, 0.45 * k, 0.12 * k, 0]
    })
    renderer.drawPoints(pointData, embers, W, H, dpr, true, 2.2)
  }

  // --- 置く ------------------------------------------------------------------

  const layout = () => {
    const narrow = W < 560
    // 短冊と篝火の大きさには上限がある。大きい画面でも位置だけ広がらないよう、
    // 置く範囲を幅 1100px・高さ 760px までに絞り、地面の上に寄せる
    const cw = narrow ? W : Math.min(W, Math.max(H * 1.4, 720), 1100)
    const ch = Math.min(H, 760)
    const ox = (W - cw) / 2
    L.groundY = Math.round(H - Math.max(16, H * 0.05))
    L.slipH = Math.round(Math.min(300, Math.max(200, ch * 0.6)))
    L.slipW = Math.round(L.slipH * 0.23)
    L.slipX = Math.round(ox + (narrow ? cw * 0.3 : cw * 0.37) - L.slipW / 2)
    L.slipY = Math.round(Math.max(26, L.groundY - ch * 0.84))
    L.fireX = Math.round(ox + (narrow ? cw * 0.74 : cw * 0.64))
    L.basketW = Math.round(Math.min(150, Math.max(92, cw * 0.17)))
    const scale = L.basketW / 120
    L.coalY = Math.round(L.groundY - 120 * scale + 24 * scale)
    L.flameW = L.basketW * 0.86
    L.flameH = Math.min(150, ch * 0.3, L.basketW * 1.25)
    const set = (name: string, v: number) =>
      stage.style.setProperty(name, `${v}px`)
    set('--slip-x', L.slipX)
    set('--slip-y', L.slipY)
    set('--slip-w', L.slipW)
    set('--slip-h', L.slipH)
    set('--ground-y', L.groundY)
    set('--fire-x', L.fireX)
    set('--basket-w', L.basketW)
  }

  canvas.addEventListener('paint', (e) => {
    const changed = (e as Event & { changedElements?: ArrayLike<Element> })
      .changedElements
    const list = changed ? Array.from(changed) : undefined
    for (const s of slips) if (!list || list.includes(s.el)) s.tex.upload()
    awake = true
  })

  onResize(canvas, ({ width, height }) => {
    W = width
    H = height
    const dpr = pixelRatio()
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    layout()
    for (const s of slips) if (s.state === 'pad') placeOnPad(s)
    awake = true
    canvas.requestPaint()
  })

  onReducedMotion((r) => {
    reduced = r
    awake = true
  })
  touchGate(stage)
  showPad(left - 1)
  addSlip(first)

  loop((dt) => {
    if (!W) return
    // 炎はひとりでに揺れ続ける。動きを減らす設定では、触っているときと燃えているときだけ描く
    if (reduced && !awake) return
    time += dt
    const sub = 2
    for (let i = 0; i < sub; i++) step(dt / sub)
    stepParticles(dt)
    render()
    if (reduced) {
      const moving =
        grab ||
        slips.some(
          (s) =>
            s.cutting ||
            (s.state === 'pad' && s.stretch > 0.05) ||
            (s.state === 'free' && inFire(s)),
        )
      awake = !!moving
    }
  })
}
