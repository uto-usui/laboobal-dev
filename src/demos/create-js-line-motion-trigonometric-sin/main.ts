import { autoplayLoop } from '../../shared/motion'
import { fiddleCanvas } from './fiddle-canvas'

// もとの fiddle の canvas は 250×250。数字はそのままで、速さは 60fps のときの 1 フレームあたり
const SIZE = 250
const centerY = SIZE / 2
const range = 80
const speedX = 0.2
const speedY = 0.02

// ペン先の x。角度は x と同じだけ時間に比例して進むので、x から求められる（angle = x / speedX * speedY）
let px = 0

const draw = (ctx: CanvasRenderingContext2D) => {
  ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.beginPath()
  ctx.moveTo(0, centerY)
  for (let x = 0; x <= px; x += 0.5) {
    ctx.lineTo(x, centerY + Math.sin((x / speedX) * speedY) * range)
  }
  ctx.lineWidth = 1
  ctx.strokeStyle = '#888888'
  ctx.stroke()
}

const ctx = fiddleCanvas(
  document.querySelector<HTMLCanvasElement>('[data-fiddle-canvas]')!,
  SIZE,
  SIZE,
  draw,
)

autoplayLoop(
  (dt) => {
    px += speedX * 60 * dt
    // もとは右の端を越えても描き続け、線が見えなくなった。端まで来たら左から描き直す
    if (px > SIZE) px = 0
    draw(ctx)
  },
  // 動きを減らす設定では、端まで描き終えた波を見せる
  () => {
    px = SIZE
    draw(ctx)
  },
)
