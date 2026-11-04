import { autoplayLoop } from '../../shared/motion'
import { random } from '../../shared/math'
import { fiddleCanvas } from './fiddle-canvas'

/*
 * もとの fiddle は 600×600 の canvas を 300×300 に縮めて見せていた。ここでは見えていた 300×300 を座標にし、
 * 長さ（点の半径、線の太さ、線を引く距離、速さ）を半分にしている。引き合う強さ（ratio）は距離に掛けるので半分にしない。
 * もとは CreateJS の Ticker の既定の 1 秒に 20 回で動いていた。なめらかにするため 1 秒に 60 回に刻み、
 * 1 回あたりの速さを 3 分の 1、加速を 9 分の 1 にした（1 秒あたりの動きは同じ）
 */
const SIZE = 300
const ballCount = 30
const ratio = 1 / 2000 / 9
const max = 50
const limit = max * max
const STEP = 1 / 60

interface Ball {
  x: number
  y: number
  vx: number
  vy: number
}

const hue = random(0, 360)
const color = (alpha: number) => `hsl(${hue} 70% 45% / ${alpha})`

const balls: Ball[] = Array.from({ length: ballCount }, () => ({
  x: random(0, SIZE),
  y: random(0, SIZE),
  vx: random(-0.5, 0.5) * (2.5 / 3),
  vy: random(-0.5, 0.5) * (2.5 / 3),
}))

// 端から出たら反対の端から出てくる
const roll = (value: number) =>
  value > SIZE ? value - SIZE : value < 0 ? value + SIZE : value

const step = () => {
  for (const ball of balls) {
    ball.x = roll(ball.x + ball.vx)
    ball.y = roll(ball.y + ball.vy)
  }
  // 近い 2 点を、距離に比例した強さで引き寄せ合う
  for (let i = 0; i < ballCount - 1; i++) {
    const a = balls[i]
    for (let j = i + 1; j < ballCount; j++) {
      const b = balls[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      if (dx * dx + dy * dy < limit) {
        a.vx += dx * ratio
        a.vy += dy * ratio
        b.vx -= dx * ratio
        b.vy -= dy * ratio
      }
    }
  }
}

const draw = (ctx: CanvasRenderingContext2D) => {
  ctx.clearRect(0, 0, SIZE, SIZE)
  // 近いほど濃い線で結ぶ
  ctx.lineWidth = 0.5
  for (let i = 0; i < ballCount - 1; i++) {
    const a = balls[i]
    for (let j = i + 1; j < ballCount; j++) {
      const b = balls[j]
      const d2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
      if (d2 < limit) {
        ctx.strokeStyle = color((max - Math.sqrt(d2)) / max)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
    }
  }
  ctx.fillStyle = color(1)
  for (const ball of balls) {
    ctx.beginPath()
    ctx.arc(ball.x, ball.y, 1, 0, Math.PI * 2)
    ctx.fill()
  }
}

const ctx = fiddleCanvas(
  document.querySelector<HTMLCanvasElement>('[data-fiddle-canvas]')!,
  SIZE,
  SIZE,
  draw,
)

let rest = 0
// 動きを減らす設定では、置いたばかりの点と線を止めたまま見せる
autoplayLoop(
  (dt) => {
    rest += dt
    while (rest >= STEP) {
      step()
      rest -= STEP
    }
    draw(ctx)
  },
  () => draw(ctx),
)
