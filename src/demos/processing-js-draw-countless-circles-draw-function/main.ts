import { random } from '../../shared/math'
import { autoplayLoop } from '../../shared/motion'
import { DEFAULT_BACKGROUND, paint, sketch } from '../../shared/processing'
import type { Mount, Params } from '../../shared/variants'

const width = 500
const height = 100
const DIAMETER = 15
/** 描き直しのために覚えておく円の数。これだけ描くと帯は何重にも埋まっていて、古い円は見えない */
const KEEP = 4000
/** 動きを減らす設定のときに、止まった絵として描いておく数（5 秒分） */
const STILL = 300

export const params = {
  // draw() は 1 秒に 60 回。1 回に円を 1 つ描く
  perSecond: { label: '1 秒に描く円', value: 60, min: 1, max: 600, step: 1 },
} satisfies Params

const circle = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.beginPath()
  ctx.arc(x, y, DIAMETER / 2, 0, Math.PI * 2)
  paint(ctx, '#fff', '#000')
}

export const mount: Mount<typeof params> = (stage, { perSecond }) => {
  const circles: { x: number; y: number }[] = []

  const add = (ctx: CanvasRenderingContext2D) => {
    const c = { x: random(0, width), y: random(0, height) }
    circles.push(c)
    if (circles.length > KEEP) circles.splice(0, circles.length - KEEP)
    circle(ctx, c.x, c.y)
  }

  // setup() にあたる。大きさが変わったら、覚えている円を描き直す
  const s = sketch(stage.querySelector('canvas')!, width, height, (ctx) => {
    ctx.fillStyle = DEFAULT_BACKGROUND
    ctx.fillRect(0, 0, width, height)
    for (const c of circles) circle(ctx, c.x, c.y)
  })

  // draw() にあたる。前のフレームの絵を消さないので、円は描き足されていく
  let due = 0
  const stop = autoplayLoop(
    (dt) => {
      due += dt * perSecond
      for (; due >= 1; due--) add(s.ctx)
    },
    () => {
      while (circles.length < STILL) add(s.ctx)
    },
  )
  return () => {
    stop()
    s.dispose()
  }
}
