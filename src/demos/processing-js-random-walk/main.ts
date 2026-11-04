import { clamp, pick } from '../../shared/math'
import { autoplayLoop } from '../../shared/motion'
import { hsb, sketch } from '../../shared/processing'
import type { Mount, Params } from '../../shared/variants'

const width = 320
const height = 320
/** frameRate(60)。1 秒に 60 歩 */
const PER_SECOND = 60
/** 動きを減らす設定のときに、止まった絵として先に進めておく歩数（50 秒分） */
const STILL = 3000
/** 足跡の点。stroke(150, 0, 20, 20) は不透明度 20% の暗い灰色 */
const ALPHA = 0.2
const DOT = 'rgb(51 51 51)'

const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

export const params = {
  count: { label: '歩く点の数', value: 3, min: 1, max: 30, step: 1 },
} satisfies Params

const dot = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  // strokeWeight(2) の point() は直径 2 の丸
  ctx.beginPath()
  ctx.arc(x, y, 1, 0, Math.PI * 2)
  ctx.fill()
}

export const mount: Mount<typeof params> = (stage, { count }) => {
  // 真ん中から歩き出す
  const walkers = Array.from({ length: count }, () => ({
    x: width / 2,
    y: height / 2,
  }))
  // 描き直すときのために、どの画素を何回踏んだかを数えておく。歩数が増えても大きさは変わらない
  const visits = new Uint16Array(width * height)

  const step = (ctx?: CanvasRenderingContext2D) => {
    for (const w of walkers) {
      // 上下左右のどれかへ 1 歩。画面の外へは出ない
      const [dx, dy] = pick(STEPS)
      w.x = clamp(w.x + dx, 0, width - 1)
      w.y = clamp(w.y + dy, 0, height - 1)
      const i = w.y * width + w.x
      if (visits[i] < 0xffff) visits[i]++
      if (ctx) {
        ctx.globalAlpha = ALPHA
        ctx.fillStyle = DOT
        dot(ctx, w.x, w.y)
        ctx.globalAlpha = 1
      }
    }
  }

  const s = sketch(stage.querySelector('canvas')!, width, height, (ctx) => {
    ctx.fillStyle = hsb(180, 35, 80, 20)
    ctx.fillRect(0, 0, width, height)
    // 20% の点を n 回重ねた濃さ（1 − 0.8^n）で、踏んだ画素を 1 回ずつ描く
    ctx.fillStyle = DOT
    for (let i = 0; i < visits.length; i++) {
      if (!visits[i]) continue
      ctx.globalAlpha = 1 - (1 - ALPHA) ** visits[i]
      dot(ctx, i % width, Math.floor(i / width))
    }
    ctx.globalAlpha = 1
  })

  let due = 0
  let walked = 0
  const stop = autoplayLoop(
    (dt) => {
      due += dt * PER_SECOND
      for (; due >= 1; due--) {
        step(s.ctx)
        walked++
      }
    },
    () => {
      if (walked >= STILL) return
      // 一度に進めた分は、描き直してまとめて描く
      for (; walked < STILL; walked++) step()
      s.redraw()
    },
  )
  return () => {
    stop()
    s.dispose()
  }
}
