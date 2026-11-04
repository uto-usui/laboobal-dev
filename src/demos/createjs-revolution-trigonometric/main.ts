import { autoplayLoop } from '../../shared/motion'
import { fiddleCanvas } from '../../shared/fiddle-canvas'

// もとの fiddle の canvas は 250×250。数字は記事のコードのままで、速さは 60fps のときの 1 フレームあたり
const SIZE = 250
const centerX = SIZE / 2
const centerY = SIZE / 2
const radius = 100
const speed = 0.01

let angle = 0

const draw = (ctx: CanvasRenderingContext2D) => {
  ctx.clearRect(0, 0, SIZE, SIZE)
  // 軌道
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
  ctx.lineWidth = 1
  ctx.strokeStyle = 'lightgray'
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(
    centerX + Math.cos(angle) * radius,
    centerY + Math.sin(angle) * radius,
    10,
    0,
    Math.PI * 2,
  )
  ctx.fillStyle = '#888888'
  ctx.fill()
}

const { ctx } = fiddleCanvas(
  document.querySelector<HTMLCanvasElement>('[data-fiddle-canvas]')!,
  SIZE,
  SIZE,
  draw,
)

autoplayLoop(
  (dt) => {
    angle += speed * 60 * dt
    draw(ctx)
  },
  // 動きを減らす設定では、回り始めの位置（右の端）で止める
  () => {
    angle = 0
    draw(ctx)
  },
)
