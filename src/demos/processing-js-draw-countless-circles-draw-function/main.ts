import { random } from '../../shared/math'
import { autoplayLoop } from '../../shared/motion'
import { DEFAULT_BACKGROUND, paint, sketch } from './sketch'

const canvas = document.querySelector<HTMLCanvasElement>('.sketch canvas')!
const width = 500
const height = 100
const DIAMETER = 15
/** draw() は 1 秒に 60 回。1 回に円を 1 つ描く */
const PER_SECOND = 60
/** 描き直しのために覚えておく円の数。これだけ描くと帯は何重にも埋まっていて、古い円は見えない */
const KEEP = 4000
/** 動きを減らす設定のときに、止まった絵として描いておく数（5 秒分） */
const STILL = 300

const circles: { x: number; y: number }[] = []

const circle = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.beginPath()
  ctx.arc(x, y, DIAMETER / 2, 0, Math.PI * 2)
  paint(ctx, '#fff', '#000')
}

const add = (ctx: CanvasRenderingContext2D) => {
  const c = { x: random(0, width), y: random(0, height) }
  circles.push(c)
  if (circles.length > KEEP) circles.splice(0, circles.length - KEEP)
  circle(ctx, c.x, c.y)
}

// setup() にあたる。大きさが変わったら、覚えている円を描き直す
const { ctx } = sketch(canvas, width, height, (ctx) => {
  ctx.fillStyle = DEFAULT_BACKGROUND
  ctx.fillRect(0, 0, width, height)
  for (const c of circles) circle(ctx, c.x, c.y)
})

// draw() にあたる。前のフレームの絵を消さないので、円は描き足されていく
let due = 0
autoplayLoop(
  (dt) => {
    due += dt * PER_SECOND
    for (; due >= 1; due--) add(ctx)
  },
  () => {
    while (circles.length < STILL) add(ctx)
  },
)
