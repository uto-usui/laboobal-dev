import {
  onResize,
  pixelRatio,
  prefersReducedMotion,
  showFallback,
} from '../../shared/dom'
import { autoplayLoop } from '../../shared/motion'
import { touchGate } from '../../shared/touch'
import { nextShape } from './shapes'
import { createRenderer } from './render'
import {
  hasPressure,
  MAX_POINTS,
  type Point,
  prepare,
  resample,
} from './stroke'

// 配色はここだけで替える。背景は初期化前や context 喪失中にも同じ色を出す
const COLORS = { paper: '#003c26', ink: '#dde3d6', tip: '#ffffff' }
const SIZE = { width: 800, height: 500 }
const DRAW = 1.6
const HOLD = 0.7
const FADE = 0.4
const CYCLE = DRAW + HOLD + FADE
const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
const stage = document.querySelector<HTMLElement>('.stage')!
const canvas = stage.querySelector('canvas')!
stage.style.background = COLORS.paper
stage.style.color = COLORS.ink
const gl = canvas.getContext('webgl2', {
  alpha: false,
  antialias: false,
  depth: false,
})
if (gl) start(gl)
else showFallback('この環境では WebGL2 が使えません')

function start(gl: WebGL2RenderingContext) {
  type Saved = { points: Point[]; pressure: boolean }
  let shape = nextShape()
  let saved: Saved = { points: shape.points, pressure: false }
  let custom = false
  let writing:
    | (Saved & {
        id: number
        pen: boolean
        start: number
        reach: number
        originX: number
        originY: number
      })
    | undefined
  let renderer: ReturnType<typeof createRenderer> | undefined
  let mesh:
    | ReturnType<ReturnType<typeof createRenderer>['createMesh']>
    | undefined
  let stopAuto: (() => void) | undefined
  let clearFallback: (() => void) | undefined
  let lost = false
  let failed = false
  let width = 0
  let height = 0
  let scale = 1
  let offset = [0, 0]
  let time = 0
  let progress = 0
  let opacity = 1
  const paper = rgb(COLORS.paper)
  const ink = rgb(COLORS.ink)

  const draw = () => {
    if (!lost && !failed && width && height)
      renderer?.draw(
        mesh,
        width,
        height,
        offset,
        progress,
        opacity,
        paper,
        ink,
        rgb(COLORS.tip),
      )
  }
  const rebuild = () => {
    if (!renderer || lost || failed) return
    mesh?.dispose()
    const stroke = writing ?? saved
    mesh = renderer.createMesh(prepare(stroke.points, stroke.pressure, scale))
  }
  const layout = () => {
    if (!renderer || lost || failed || !width || !height) return
    scale = Math.min(width / SIZE.width, height / SIZE.height)
    offset = [
      (width - SIZE.width * scale) / 2,
      (height - SIZE.height * scale) / 2,
    ]
    renderer.resize(width, height, pixelRatio())
    rebuild()
    draw()
  }
  const fail = () => {
    failed = true
    stopAuto?.()
    clearFallback?.()
    clearFallback = showFallback('線を描くための WebGL の初期化に失敗しました')
  }
  const run = () => {
    stopAuto?.()
    stopAuto = autoplayLoop(
      (dt) => {
        if (writing || lost || failed) return
        time += dt
        if (time >= CYCLE) {
          time %= CYCLE
          if (!custom) {
            shape = nextShape(shape.index)
            saved = { points: shape.points, pressure: false }
            rebuild()
          }
        }
        const q = Math.min(time / DRAW, 1)
        progress = q * q * (3 - 2 * q)
        opacity = time <= DRAW + HOLD ? 1 : (CYCLE - time) / FADE
        draw()
      },
      () => {
        time = 0
        progress = 1
        opacity = 1
        draw()
      },
    )
  }

  const init = () => {
    try {
      renderer = createRenderer(gl)
      mesh = undefined
      lost = failed = false
      clearFallback?.()
      clearFallback = undefined
      layout()
      run()
    } catch {
      fail()
    }
  }

  const append = (event: PointerEvent, ending = false) => {
    if (!writing) return
    const rect = stage.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    if (x < 0 || x > width || y < 0 || y > height) return false
    const last = writing.points.at(-1)
    const pressure = ending
      ? (last?.[3] ?? 0.5)
      : writing.pen
        ? event.pressure
        : 0.5
    if (writing.pen && !ending && hasPressure(pressure)) writing.pressure = true
    writing.reach = Math.max(
      writing.reach,
      Math.hypot(x - writing.originX, y - writing.originY),
    )
    const point: Point = [
      (x - offset[0]) / scale,
      (y - offset[1]) / scale,
      Math.max(0, event.timeStamp - writing.start),
      pressure,
    ]
    if (
      !last ||
      point[0] !== last[0] ||
      point[1] !== last[1] ||
      point[2] !== last[2]
    )
      writing.points.push(point)
    // 上限に届くたびに間隔を広げ、長い線でも最後まで記録する
    if (writing.points.length > MAX_POINTS)
      writing.points = resample(writing.points, MAX_POINTS / 2)
    return true
  }

  const finish = (commit: boolean) => {
    if (!writing) return
    const pending = writing
    const valid =
      commit &&
      pending.reach >= 10 &&
      prepare(pending.points, pending.pressure, scale).length >= 3
    writing = undefined
    if (canvas.hasPointerCapture(pending.id))
      canvas.releasePointerCapture(pending.id)
    if (valid) {
      saved = { points: pending.points, pressure: pending.pressure }
      custom = true
      stage.querySelector('[data-draw-prompt]')?.classList.add('is-hidden')
    }
    time = valid ? 0 : DRAW
    progress = valid && !prefersReducedMotion() ? 0 : 1
    opacity = 1
    rebuild()
    draw()
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (
      e.button !== 0 ||
      !e.isPrimary ||
      writing ||
      lost ||
      failed ||
      !width ||
      !height
    )
      return
    const rect = stage.getBoundingClientRect()
    writing = {
      id: e.pointerId,
      pen: e.pointerType === 'pen',
      start: e.timeStamp,
      points: [],
      pressure: false,
      reach: 0,
      originX: e.clientX - rect.left,
      originY: e.clientY - rect.top,
    }
    append(e)
    canvas.setPointerCapture(e.pointerId)
    time = DRAW
    progress = opacity = 1
    rebuild()
    draw()
  })
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== writing?.id) return
    const coalesced = e.getCoalescedEvents?.()
    for (const sample of coalesced?.length ? coalesced : [e]) {
      // 外へ出たら、そこまで書いた線で確定する。端に触れただけで書いた線を捨てない
      if (!append(sample)) {
        finish(true)
        return
      }
    }
    rebuild()
    draw()
  })
  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerId !== writing?.id) return
    append(e, true)
    finish(true)
  })
  for (const type of ['pointercancel', 'lostpointercapture'])
    canvas.addEventListener(type, (e) => {
      if ((e as PointerEvent).pointerId === writing?.id) finish(false)
    })
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerId === writing?.id) finish(true)
  })
  touchGate(stage)

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    lost = true
    stopAuto?.()
    finish(false)
  })
  canvas.addEventListener('webglcontextrestored', init)
  onResize(stage, (size) => {
    width = size.width
    height = size.height
    try {
      layout()
    } catch {
      fail()
    }
  })
  // CSS 寸法が変わらない画面間の移動も拾い、新しい DPR で見張り直す
  const watchDpr = () => {
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
      'change',
      () => {
        try {
          layout()
        } catch {
          fail()
        }
        watchDpr()
      },
      { once: true },
    )
  }
  watchDpr()
  init()
}
