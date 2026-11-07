import { loop, onResize, pixelRatio } from '../../shared/dom'
import { htmlCanvasGl, showFlatFallback } from '../../shared/html-canvas'
import { clamp, damp } from '../../shared/math'
import { onReducedMotion } from '../../shared/motion'
import { touchGate } from '../../shared/touch'
import { whenVisible } from '../../shared/visibility'
import {
  CORE_L,
  CORE_R,
  createScene,
  KNOB,
  KY,
  PAPER_H,
  type Rolls,
  rollRadius,
  SHEET_W,
  type View,
} from './scene'

const stage = document.querySelector<HTMLElement>('.stage')!
const canvas = stage.querySelector<HTMLCanvasElement>('canvas.view')!
const sheets = [...canvas.querySelectorAll<HTMLElement>('.sheet')]

// 奥書に、流した灯籠の数と今日の日付を漢数字で書く
const KANJI = '〇一二三四五六七八九'
const digits = (n: number) => String(n).replace(/\d/g, (d) => KANJI[Number(d)])
const kanji = (n: number) => {
  if (n < 10) return KANJI[n]
  const tens = Math.floor(n / 10)
  return `${tens > 1 ? KANJI[tens] : ''}十${n % 10 ? KANJI[n % 10] : ''}`
}
const lanterns = [
  ...canvas.querySelectorAll<HTMLInputElement>('.lantern input'),
]
const countOut = canvas.querySelector<HTMLElement>('[data-count]')!
const updateCount = () => {
  const n = lanterns.filter((input) => input.checked).length
  countOut.textContent = n ? `${kanji(n)}つ` : 'ひとつも'
}
for (const input of lanterns) input.addEventListener('change', updateCount)
updateCount()
const today = new Date()
canvas.querySelector<HTMLElement>('[data-date]')!.textContent =
  `${digits(today.getFullYear())}年${kanji(today.getMonth() + 1)}月${kanji(today.getDate())}日`

const gl = htmlCanvasGl(canvas)
if (gl) start(gl)
else {
  // 使えないときは、紙を右から左へ横に並べて、ふつうに横へスクロールして読む
  const row = document.createElement('div')
  row.className = 'flat-row'
  stage.classList.add('is-flat')
  stage.append(row)
  showFlatFallback(canvas, sheets, row)
  const note = row.lastElementChild
  if (note) stage.append(note)
}

function start(gl: WebGL2RenderingContext) {
  const scene = createScene(gl, sheets.length)
  const LEN = scene.LEN
  const R_MAX = rollRadius(CORE_L, LEN)
  const CONTENT_H = PAPER_H + KNOB * 2 + KY * 2 * R_MAX

  const view: View = { width: 0, height: 0, dpr: 1, k: 1, ox: 0, oy: 0 }
  // 平らに開く幅（縮める前の px）
  let flatW = 0
  // 読んだ長さ。右の端に来ている紙の位置で数える
  let read = 0
  let velocity = 0
  let target: number | undefined
  // 開いていく途中（0〜1）。最初は巻いたまま右に置いてある
  let opening = 0
  let openingPlay = false
  let lift = 0
  let reduced = false
  let ready = false
  let dirty = true

  const maxRead = () => Math.max(0, LEN - flatW)
  const openWidth = () => flatW * (1 - (1 - opening) ** 3)

  const rolls = (): Rolls => {
    const sR = clamp(read, 0, LEN)
    const sL = clamp(read + openWidth(), sR, LEN)
    const x = (s: number) => flatW - (s - read)
    return {
      right: [x(sR), rollRadius(CORE_R, sR), CORE_R, sR],
      left: [x(sL), rollRadius(CORE_L, LEN - sL), CORE_L, sL],
    }
  }

  canvas.addEventListener('paint', (e) => {
    const size = canvas.getElementImageDefaultSize(sheets[0])
    const tw = Math.ceil(size.width)
    const th = Math.ceil(size.height)
    if (!tw || !th) return
    const all = scene.allocate(tw, th) || !ready
    // changedElements には、変わった子だけが入る（Chrome 157）。TypeScript の型にはまだない
    const list = (e as Event & { changedElements?: Iterable<Element> })
      .changedElements
    const changed = list ? new Set(list) : undefined
    for (const [i, sheet] of sheets.entries())
      if (all || !changed || changed.has(sheet)) scene.upload(i, sheet)
    ready = true
    dirty = true
  })

  // 当たり判定は平らに見えている所だけ。巻きの下に隠れた幅も外す
  const hitKeys: string[] = []
  const placeHitAreas = (r: Rolls) => {
    const from = r.right[3] + r.right[1]
    const to = r.left[3] - r.left[1]
    for (const [i, sheet] of sheets.entries()) {
      const a = Math.max(from, i * SHEET_W)
      const b = Math.min(to, (i + 1) * SHEET_W)
      const off = lift > 1 || b - a < 1
      const tx =
        view.ox + view.k * (r.right[0] - ((i + 1) * SHEET_W - r.right[3]))
      const key = off ? 'off' : `${tx},${a},${b},${view.k},${view.oy}`
      if (hitKeys[i] === key) continue
      hitKeys[i] = key
      if (off) {
        canvas.clearElementGeometry(sheet)
        continue
      }
      canvas.updateElementGeometry(sheet, {
        canvasTransform: new DOMMatrix().translate(tx, view.oy).scale(view.k),
        canvasClip: {
          x: (i + 1) * SHEET_W - b,
          y: 0,
          width: b - a,
          height: PAPER_H,
        },
      })
    }
  }

  // 巻きの奥に入った紙は、CSS のアニメーションを止める。止めないと paint が出続ける
  const awake: boolean[] = []
  const pauseHidden = (r: Rolls) => {
    const from = r.right[3] - 2 * Math.PI * r.right[1] * 2
    const to = r.left[3] + 2 * Math.PI * r.left[1] * 2
    for (const [i, sheet] of sheets.entries()) {
      const on = (i + 1) * SHEET_W > from && i * SHEET_W < to
      if (awake[i] === on) continue
      awake[i] = on
      sheet.classList.toggle('is-rolled', !on)
    }
  }

  onResize(stage, ({ width, height }) => {
    if (!width || !height) return
    const dpr = pixelRatio()
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const pad = width < 560 ? 14 : 36
    const k = Math.min(1.1, (height - 40) / CONTENT_H, width / 470)
    // 右の端に来ている位置を保ったまま、開く幅を変える
    flatW = Math.max(120, (width - pad * 2) / k - R_MAX * 2)
    read = clamp(read, 0, maxRead())
    Object.assign(view, {
      width,
      height,
      dpr,
      k,
      ox: pad + k * R_MAX,
      oy: (height - k * CONTENT_H) / 2 + k * (KNOB + KY * 2 * R_MAX),
    })
    hitKeys.length = 0
    dirty = true
    canvas.requestPaint()
  })

  onReducedMotion((value) => {
    reduced = value
    if (!reduced) return
    velocity = 0
    lift = 0
    if (openingPlay) opening = 1
    if (target !== undefined) read = target
    target = undefined
    dirty = true
  })

  whenVisible(() => {
    if (reduced) opening = 1
    else openingPlay = true
    dirty = true
  })

  // --- 動かす ---------------------------------------------------------------

  const INTERACTIVE = 'input, label, a, button, select, textarea'
  let drag:
    | { id: number; x: number; read: number; t: number; moved: number }
    | undefined
  let lastMoved = 0

  // 端を越えて引いたときは、紙が張って重くなる
  const resist = (value: number) => {
    const max = maxRead()
    if (value < 0) return value * 0.3
    if (value > max) return max + (value - max) * 0.3
    return value
  }

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    if ((e.target as Element).closest(INTERACTIVE)) return
    e.preventDefault()
    target = undefined
    velocity = 0
    drag = { id: e.pointerId, x: e.clientX, read, t: e.timeStamp, moved: 0 }
    stage.setPointerCapture(e.pointerId)
    stage.classList.add('is-grabbing')
  })
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return
    const dx = e.clientX - drag.x
    const next = resist(drag.read + dx / view.k)
    const dt = Math.max(1, e.timeStamp - drag.t) / 1000
    velocity = damp(velocity, (next - read) / dt, 18, dt)
    drag.t = e.timeStamp
    drag.moved = Math.max(drag.moved, Math.abs(dx))
    read = next
    dirty = true
  })
  const release = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return
    // 止めてから離したときは流さない
    if (e.timeStamp - drag.t > 80 || reduced) velocity = 0
    lastMoved = drag.moved
    drag = undefined
    stage.classList.remove('is-grabbing')
  }
  stage.addEventListener('pointerup', release)
  stage.addEventListener('pointercancel', release)
  touchGate(stage)

  // トラックパッドの横のスワイプ。縦のホイールは記事のスクロールに残す
  stage.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      e.preventDefault()
      const unit = e.deltaMode === 1 ? 16 : 1
      target = undefined
      velocity = 0
      read = resist(read - (e.deltaX * unit) / view.k)
      dirty = true
    },
    { passive: false },
  )

  const goTo = (value: number) => {
    const next = clamp(value, 0, maxRead())
    velocity = 0
    if (reduced) {
      read = next
      target = undefined
    } else target = next
    dirty = true
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const el = e.target as HTMLElement
    if (el instanceof HTMLInputElement && el.type === 'radio') return
    e.preventDefault()
    const step = flatW * 0.6 * (e.key === 'ArrowLeft' ? 1 : -1)
    goTo((target ?? read) + step)
  })

  // 巻かれた所の部品に Tab で来たら、平らな所の真ん中まで開く。クリックでフォーカスが移ったときは動かさない
  canvas.addEventListener('focusin', (e) => {
    const el = e.target as HTMLElement
    const sheet = el.closest<HTMLElement>('.sheet')
    if (!sheet || !el.matches(':focus-visible')) return
    let local = el.offsetWidth / 2
    for (
      let n: HTMLElement | null = el;
      n && n !== sheet;
      n = n.offsetParent as HTMLElement | null
    )
      local += n.offsetLeft
    const s = (sheets.indexOf(sheet) + 1) * SHEET_W - local
    const r = rolls()
    if (s > r.right[3] + r.right[1] + 40 && s < r.left[3] - r.left[1] - 40)
      return
    goTo(s - flatW / 2)
  })

  // 引いたあとの click は、紙の上の部品に届かせない
  stage.addEventListener(
    'click',
    (e) => {
      if (lastMoved > 6) {
        e.stopPropagation()
        e.preventDefault()
      }
      lastMoved = 0
    },
    true,
  )

  loop((dt) => {
    if (!ready || !flatW) return
    const before = read
    if (openingPlay && opening < 1) {
      opening = Math.min(1, opening + dt / 2.6)
      dirty = true
    }
    if (!drag) {
      const max = maxRead()
      if (target !== undefined) {
        read = damp(read, target, 7, dt)
        if (Math.abs(read - target) < 0.3) {
          read = target
          target = undefined
        }
      } else if (Math.abs(velocity) > 2) {
        read += velocity * dt
        velocity *= Math.exp(-dt * (read < 0 || read > max ? 14 : 1.9))
      } else velocity = 0
      // 端を越えていたら戻す
      if (read < 0 && Math.abs(velocity) < 400) read = damp(read, 0, 10, dt)
      if (read > max && Math.abs(velocity) < 400) read = damp(read, max, 10, dt)
      if (Math.abs(read) < 0.05) read = Math.max(read, 0)
    }
    const speed = drag
      ? Math.abs(read - before) / Math.max(dt, 1 / 120)
      : Math.abs(velocity)
    const nextLift = reduced ? 0 : damp(lift, Math.min(9, speed / 260), 5, dt)
    if (Math.abs(nextLift - lift) > 0.01) {
      lift = nextLift
      dirty = true
    } else if (lift < 0.02) lift = 0
    if (read !== before) dirty = true
    if (!dirty) return
    dirty = false
    const r = rolls()
    scene.render(view, r, lift)
    placeHitAreas(r)
    pauseHidden(r)
  })
}
