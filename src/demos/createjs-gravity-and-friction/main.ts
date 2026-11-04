import { autoplayLoop } from '../../shared/motion'
import { fiddleCanvas } from '../../shared/fiddle-canvas'

// もとの fiddle の canvas は 250×250。数字は記事のコードのままで、1 フレームあたりの量
const SIZE = 250
const size = 10
const ground = SIZE - size
const STEP = 1 / 60

const particle = { x: SIZE / 2, y: 0 }
let vy = 0
// 地面からほとんど浮かなくなってからの秒数
let resting = 0
// 1 フレームより短い時間の余り。重力と摩擦は 1 フレームごとの量なので、1/60 秒ずつ刻んで当てる
let rest = 0

const step = () => {
  // 重力
  vy += 0.5
  // 摩擦
  vy *= 0.95
  particle.y += vy
  // 地面
  if (particle.y > ground) {
    particle.y = ground
    vy *= -1
  }
}

const draw = (ctx: CanvasRenderingContext2D) => {
  ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.beginPath()
  ctx.arc(particle.x, particle.y, size, 0, Math.PI * 2)
  ctx.fillStyle = 'hsl(160 65% 70%)'
  ctx.fill()
}

const ctx = fiddleCanvas(
  document.querySelector<HTMLCanvasElement>('[data-fiddle-canvas]')!,
  SIZE,
  SIZE,
  draw,
)

autoplayLoop(
  (dt) => {
    rest += dt
    while (rest >= STEP) {
      step()
      rest -= STEP
    }
    // もとは一度落ちて止まったらそのままだった。止まって 1 秒たったら、また上から落とす
    resting = particle.y > ground - 1 ? resting + dt : 0
    if (resting > 1) {
      particle.y = 0
      vy = 0
      resting = 0
    }
    draw(ctx)
  },
  // 動きを減らす設定では、地面で止まった姿を見せる
  () => {
    particle.y = ground
    vy = 0
    draw(ctx)
  },
)
