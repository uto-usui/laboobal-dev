import {
  loop,
  onResize,
  pixelRatio,
  prefersReducedMotion,
} from '../../shared/dom'
import {
  elementTexture,
  htmlCanvasGl,
  showFlatFallback,
} from '../../shared/html-canvas'
import { clamp, toRadian } from '../../shared/math'
import { touchGate } from '../../shared/touch'
import { aim, cornerNear, extent, foldFor, type Shape, travel } from './peel'
import { createRenderer, type Placement } from './render'

const stage = document.querySelector<HTMLElement>('.stage')!
const canvas = stage.querySelector<HTMLCanvasElement>('canvas.view')!
const elements = [...canvas.querySelectorAll<HTMLElement>('.sticker')]

// 透視の強さ（画面から目までの距離、px）
const FOCAL = 1400
// 丸いシールは、縁から中心へ向かう向きの左右この角度までは、引いた向きにめくれる
const CONE = toRadian(70)
// 折り目はシールの奥行きのこの割合まで。ここより先は引いても重くなり、剥がれきらない
const HOLD = 0.82
// マウスを角に近づけたときに、角をこれだけ浮かせて誘う
const HOVER_LIFT = 7
const HOVER_REACH = 26
// 離したあとに貼り戻るばね。箱に当たると、跳ね返りの割合だけ戻って角が跳ねる。
// 跳ねる速さには上限を付け、大きくめくって離しても跳ねすぎないようにする
const SPRING = 200
const FRICTION = 8
const BOUNCE = 0.3
const BOUNCE_MAX = 450

type Place = { x: number; y: number; deg: number; layer: number }
// 横長と縦長の画面で、シールの中心の置き場所（画面の割合）と傾き。layer はめくれた所が重なったときの前後。
// シールどうしは重ねない。下のシールの角をめくると、上に貼ったシールを突き抜けて持ち上がってしまうため
const WIDE: Record<string, Place> = {
  updown: { x: 0.2, y: 0.36, deg: -8, layer: 0 },
  label: { x: 0.42, y: 0.56, deg: -3, layer: 1 },
  fragile: { x: 0.72, y: 0.4, deg: 6, layer: 2 },
  seal: { x: 0.63, y: 0.79, deg: -10, layer: 3 },
}
const TALL: Record<string, Place> = {
  updown: { x: 0.32, y: 0.26, deg: -8, layer: 0 },
  label: { x: 0.5, y: 0.48, deg: -3, layer: 1 },
  fragile: { x: 0.5, y: 0.8, deg: 6, layer: 2 },
  seal: { x: 0.7, y: 0.64, deg: -10, layer: 3 },
}

const gl = htmlCanvasGl(canvas, { stencil: true })
if (gl) start(gl)
else {
  const column = document.createElement('div')
  column.className = 'flat'
  stage.append(column)
  showFlatFallback(canvas, elements, column)
}

function start(gl: WebGL2RenderingContext) {
  const renderer = createRenderer(gl)

  const stickers = elements.map((el) => {
    const shape: Shape = { w: 0, h: 0, round: el.classList.contains('seal') }
    return {
      el,
      name: el.classList[1],
      shape,
      tex: elementTexture(gl, canvas, el),
      mesh: undefined as ReturnType<typeof renderer.createMesh> | undefined,
      at: {} as Placement,
      // つまんだ角。丸いシールでは、つまんだ縁の点
      cornerX: 0,
      cornerY: 0,
      // めくれる起点、めくれる向き（起点から中へ）、めくった量
      p0x: 0,
      p0y: 0,
      dx: 1,
      dy: 0,
      // 角から中心へ向かう向き
      inX: 1,
      inY: 0,
      amount: 0,
      velocity: 0,
      target: 0,
      held: false,
      pressX: 0,
      pressY: 0,
    }
  })
  type Sticker = (typeof stickers)[number]

  let W = 0
  let H = 0
  let awake = true

  const placeAll = () => {
    const tall = W < H * 0.9
    const table = tall ? TALL : WIDE
    const scale = tall
      ? clamp(W / 430, 0.55, 1)
      : clamp(Math.min(W / 860, H / 540), 0.55, 1)
    for (const s of stickers) {
      const w = s.el.offsetWidth
      const h = s.el.offsetHeight
      if (w !== s.shape.w || h !== s.shape.h) {
        s.shape.w = w
        s.shape.h = h
        s.mesh?.dispose()
        s.mesh = renderer.createMesh(w, h)
      }
      const p = table[s.name]
      s.at = {
        w,
        h,
        cx: p.x * W,
        cy: p.y * H,
        rot: toRadian(p.deg),
        scale,
        layer: p.layer,
      }
      // 変換の候補の窓がシールの近くに出るよう、HTML の箱も描く位置のあたりに置く
      s.el.style.left = `${s.at.cx - w / 2}px`
      s.el.style.top = `${s.at.cy - h / 2}px`
      // 当たり判定は、貼ってあるときのシールの位置に置く。めくれている間は HTML に触らせない（pointerdown）
      canvas.updateElementGeometry(s.el, {
        canvasTransform: new DOMMatrix()
          .translate(s.at.cx, s.at.cy)
          .rotate(p.deg)
          .scale(scale)
          .translate(-w / 2, -h / 2),
      })
    }
  }

  const layout = () => {
    const rect = canvas.getBoundingClientRect()
    W = rect.width
    H = rect.height
    const dpr = pixelRatio()
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    placeAll()
    canvas.requestPaint()
    awake = true
  }
  onResize(canvas, layout)

  // シールの中身（入力、フォーカス）が変わるたびに paint が来る。そのときだけテクスチャを写し直す
  canvas.addEventListener('paint', () => {
    for (const s of stickers) s.tex.upload()
    awake = true
  })

  // --- 当たり ---------------------------------------------------------------

  /** 画面の点を、貼ってあるときのシールの中の座標へ */
  const toLocal = (s: Sticker, x: number, y: number) => {
    const { cx, cy, rot, scale, w, h } = s.at
    const c = Math.cos(-rot)
    const n = Math.sin(-rot)
    const qx = x - cx
    const qy = y - cy
    return [
      (c * qx - n * qy) / scale + w / 2,
      (n * qx + c * qy) / scale + h / 2,
    ]
  }

  const contains = (s: Sticker, lx: number, ly: number) => {
    const { w, h, round } = s.shape
    if (round) return Math.hypot(lx - w / 2, ly - h / 2) <= w / 2
    return lx >= 0 && ly >= 0 && lx <= w && ly <= h
  }

  /** 押した所にある、いちばん上のシール */
  const topAt = (x: number, y: number) => {
    let best: Sticker | undefined
    for (const s of stickers) {
      const [lx, ly] = toLocal(s, x, y)
      if (contains(s, lx, ly) && (!best || s.at.layer > best.at.layer)) best = s
    }
    return best
  }

  const isFlat = (s: Sticker) => !s.held && s.amount < 0.5

  /** 角を決める。めくれたまま跳ねている間は、同じ角をつかみ直す */
  const takeCorner = (s: Sticker, lx: number, ly: number) => {
    if (s.amount > 1) return
    const [px, py] = cornerNear(s.shape, lx, ly)
    s.cornerX = px
    s.cornerY = py
    const len = Math.hypot(s.shape.w / 2 - px, s.shape.h / 2 - py) || 1
    s.inX = (s.shape.w / 2 - px) / len
    s.inY = (s.shape.h / 2 - py) / len
    pull(s, s.inX, s.inY)
  }

  /** 引いた向きから、めくれる起点と向きを決める */
  const pull = (s: Sticker, dx: number, dy: number) => {
    const a = aim(s.shape, s.cornerX, s.cornerY, s.inX, s.inY, dx, dy, CONE)
    s.p0x = a.p0x
    s.p0y = a.p0y
    s.dx = a.dx
    s.dy = a.dy
  }

  const local = (e: PointerEvent) => {
    const rect = stage.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }

  const INTERACTIVE = 'input, button, label, a, select, textarea'
  let holding: Sticker | undefined
  // つかんでいる指。ほかの指の動きや離すのは見ない
  let holdingId = -1

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || holding) return
    const [x, y] = local(e)
    const s = topAt(x, y)
    if (!s) return
    // 貼ってあるときは、欄はふつうに使える。それ以外の所をつまむ
    if (isFlat(s) && (e.target as Element).closest(INTERACTIVE)) return
    // フォーカスを動かさない。名前を書きかけのままめくっても、打った字がシールに写り続ける
    e.preventDefault()
    const [lx, ly] = toLocal(s, x, y)
    takeCorner(s, lx, ly)
    // 跳ねている途中でつかんでも、めくれた量がそこから続くようにする。指の動きに直した量から始める
    const start = unlimited(s, s.amount)
    s.pressX = lx - s.dx * start
    s.pressY = ly - s.dy * start
    s.target = start
    s.held = true
    holding = s
    holdingId = e.pointerId
    for (const o of stickers) if (o !== s) o.target = 0
    awake = true
    stage.setPointerCapture(e.pointerId)
    stage.classList.add('is-grabbing')
  })

  stage.addEventListener('pointermove', (e) => {
    const [x, y] = local(e)
    if (holding) {
      if (e.pointerId !== holdingId) return
      const s = holding
      const [lx, ly] = toLocal(s, x, y)
      const mx = lx - s.pressX
      const my = ly - s.pressY
      pull(s, mx, my)
      s.target = Math.hypot(mx, my)
      awake = true
      return
    }
    // マウスで角に近づくと、角が少し浮く
    const over = topAt(x, y)
    stage.classList.toggle(
      'is-over',
      !!over && !(e.target as Element).closest(INTERACTIVE),
    )
    for (const s of stickers) {
      let lift = 0
      if (s === over && e.pointerType === 'mouse') {
        const [lx, ly] = toLocal(s, x, y)
        const [px, py] = cornerNear(s.shape, lx, ly)
        if (Math.hypot(lx - px, ly - py) < HOVER_REACH) {
          takeCorner(s, lx, ly)
          lift = HOVER_LIFT
        }
      }
      if (s.target !== lift) {
        s.target = lift
        awake = true
      }
    }
  })

  const release = (e: PointerEvent) => {
    if (!holding || e.pointerId !== holdingId) return
    holding.held = false
    holding.target = 0
    holding = undefined
    stage.classList.remove('is-grabbing')
    awake = true
  }
  stage.addEventListener('pointerup', release)
  stage.addEventListener('pointercancel', release)
  stage.addEventListener('pointerleave', () => {
    if (holding) return
    for (const s of stickers) s.target = 0
    stage.classList.remove('is-over')
    awake = true
  })
  touchGate(stage)

  // --- 動き -----------------------------------------------------------------

  /** 引いた量を、剥がれきらない所で重くする */
  const limited = (s: Sticker, raw: number) => {
    const max = travelLimit(s)
    const soft = max * 0.7
    if (raw <= soft) return raw
    return soft + (max - soft) * Math.tanh((raw - soft) / (max - soft))
  }

  /** limited の逆。めくれた量から、指がどれだけ動いたことにするか */
  const unlimited = (s: Sticker, amount: number) => {
    const max = travelLimit(s)
    const soft = max * 0.7
    if (amount <= soft) return amount
    const k = Math.min((amount - soft) / (max - soft), 0.999)
    return soft + (max - soft) * Math.atanh(k)
  }

  /** 折り目が HOLD の所まで進んだときに、角が動いた距離 */
  const travelLimit = (s: Sticker) =>
    travel(extent(s.shape, s.p0x, s.p0y, s.dx, s.dy) * HOLD)

  const STEP = 1 / 240
  const step = (s: Sticker, dt: number) => {
    if (s.held) {
      const before = s.amount
      const goal = limited(s, s.target)
      // 指に少し遅れてついてくる。紙のこしの重さ
      s.amount += (goal - s.amount) * (1 - Math.exp(-dt * 28))
      s.velocity = dt > 0 ? (s.amount - before) / dt : 0
      return Math.abs(goal - s.amount) > 0.05
    }
    const calm = prefersReducedMotion()
    // 動きを減らす設定では、行き過ぎずに貼り戻す
    const friction = calm ? 2 * Math.sqrt(SPRING) : FRICTION
    const bounce = calm ? 0 : BOUNCE
    // 勢いよく離しても、剥がれきらない所の先へは行かせない
    const max = travelLimit(s)
    for (let t = 0; t < dt; t += STEP) {
      const h = Math.min(STEP, dt - t)
      s.velocity += (SPRING * (s.target - s.amount) - friction * s.velocity) * h
      s.amount += s.velocity * h
      if (s.amount > max) {
        s.amount = max
        s.velocity = Math.min(s.velocity, 0)
      }
      if (s.amount < 0) {
        s.amount = 0
        s.velocity = Math.min(-s.velocity * bounce, BOUNCE_MAX)
      }
    }
    const resting =
      Math.abs(s.velocity) < 1 && Math.abs(s.target - s.amount) < 0.05
    if (resting) {
      s.amount = s.target
      s.velocity = 0
    }
    return !resting
  }

  const render = () => {
    renderer.begin(W, H, FOCAL)
    const order = [...stickers].sort((a, b) => a.at.layer - b.at.layer)
    for (const s of order) {
      if (!s.tex.ready || !s.mesh) continue
      renderer.draw(s.mesh, s.tex.texture!, s.at, {
        p0x: s.p0x,
        p0y: s.p0y,
        dx: s.dx,
        dy: s.dy,
        fold: foldFor(s.amount),
      })
    }
  }

  loop((dt) => {
    if (!awake || !W) return
    let moving = false
    for (const s of stickers) if (step(s, dt)) moving = true
    render()
    if (!moving) awake = false
  })
}
