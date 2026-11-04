import { fitCanvas, onResize } from '../../shared/dom'
import { distance, pick, random } from '../../shared/math'
import { autoplayLoop } from '../../shared/motion'
import type { Mount, Params } from '../../shared/variants'

interface Ball {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
}

interface Layer {
  balls: Ball[]
  sizes: number[]
  colors: string[]
  /** この距離より近い玉どうしを線で結ぶ */
  linkDistance: number
  lineColor: string
}

// 数字はすべて CSS ピクセル。速さは 60fps のときの 1 フレームあたり
const CELL_X = 70
const CELL_Y = 80
const BASE_SPEED = 0.25

export const params = {
  speed: { label: '弾く速さ', value: 2.75, min: 0.25, max: 50 },
} satisfies Params

export const mount: Mount<typeof params> = (stage, { speed }) => {
  // 奥（小さく暗い）から手前（大きく明るい）の順に描く。玉がぶつかるのは同じ層の中だけ
  const layers: Layer[] = [
    {
      balls: [],
      sizes: [5, 3],
      colors: ['#235542', '#463b5f'],
      linkDistance: 45,
      lineColor: '#333',
    },
    {
      balls: [],
      sizes: [7, 6],
      colors: ['#3b9372', '#3e549b', '#6a519b'],
      linkDistance: 75,
      lineColor: '#666',
    },
    {
      balls: [],
      sizes: [12, 9, 8],
      colors: ['#4ecca3', '#5a81e5', '#e5754a', '#a98bf3'],
      linkDistance: 100,
      lineColor: '#fff',
    },
  ]
  const [small, middle, large] = layers

  const canvas = stage.querySelector<HTMLCanvasElement>('.nodeballs canvas')!
  const ctx = canvas.getContext('2d')!
  let width = 0
  let height = 0

  const createBall = (x: number, y: number, layer: Layer): Ball => {
    const angle = random(0, Math.PI * 2)
    return {
      x,
      y,
      vx: Math.cos(angle) * BASE_SPEED,
      vy: Math.sin(angle) * BASE_SPEED,
      size: pick(layer.sizes),
      color: pick(layer.colors),
    }
  }

  /**
   * 画面を升目に分け、升ごとに 0〜5 の数を引いて、どの層の玉を置くかを決める。
   * 3〜5 を引いた升には何も置かないので、升目のところどころに穴ができ、並びが規則的に見えない
   */
  const createBalls = () => {
    for (const layer of layers) layer.balls = []
    const columns = Math.floor(width / CELL_X)
    const rows = Math.floor(height / CELL_Y)
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const x = CELL_X * column + 40 - 10 * Math.random()
        const y = CELL_Y * row + 40 - 10 * Math.random()
        const n = Math.floor(Math.random() * 5.5)
        if (n === 0 || n === 2) large.balls.push(createBall(x, y, large))
        if (n === 0 || n === 1) middle.balls.push(createBall(x, y, middle))
        if (n === 1 || n === 2) small.balls.push(createBall(x, y, small))
      }
    }
  }

  /** 近い玉を線で結び、重なった玉は互いに反対へ弾く */
  const linkAndCollide = (layer: Layer) => {
    const { balls } = layer
    ctx.strokeStyle = layer.lineColor
    ctx.lineWidth = 0.5
    ctx.globalAlpha = 0.6
    for (let i = 0; i < balls.length - 1; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i]
        const b = balls[j]
        const d = distance(a.x, a.y, b.x, b.y)
        if (d < layer.linkDistance) {
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
        if (d < a.size + b.size) {
          const angle = Math.atan2(b.y - a.y, b.x - a.x)
          b.vx = Math.cos(angle) * speed
          b.vy = Math.sin(angle) * speed
          a.vx = -b.vx
          a.vy = -b.vy
        }
      }
    }
    ctx.globalAlpha = 1
  }

  const move = (ball: Ball, frames: number) => {
    // 弾かれて速くなった分を、毎フレーム 1 割ずつ減らして、もとの速さに戻す
    const current = Math.hypot(ball.vx, ball.vy)
    if (current > BASE_SPEED) {
      const next = BASE_SPEED + (current - BASE_SPEED) * 0.9 ** frames
      ball.vx *= next / current
      ball.vy *= next / current
    }
    ball.x += ball.vx * frames
    ball.y += ball.vy * frames

    if (ball.x - ball.size < 0) ball.vx = Math.abs(ball.vx)
    if (ball.x + ball.size > width) ball.vx = -Math.abs(ball.vx)
    if (ball.y - ball.size < 0) ball.vy = Math.abs(ball.vy)
    if (ball.y + ball.size > height) ball.vy = -Math.abs(ball.vy)
  }

  const draw = (frames: number) => {
    ctx.clearRect(0, 0, width, height)
    for (const layer of layers) {
      linkAndCollide(layer)
      for (const ball of layer.balls) {
        move(ball, frames)
        ctx.fillStyle = ball.color
        ctx.beginPath()
        ctx.arc(ball.x, ball.y, ball.size, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  const stopResize = onResize(canvas, () => {
    ;({ width, height } = fitCanvas(canvas, ctx))
    createBalls()
    draw(0)
  })

  const stop = autoplayLoop((dt) => draw(dt * 60))

  return () => {
    stop()
    stopResize()
  }
}
