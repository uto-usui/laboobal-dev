import { autoplayLoop } from '../../shared/motion'
import { fiddleCanvas } from '../../shared/fiddle-canvas'

// もとの fiddle の canvas は 250×250。数字は記事のコードのままで、速さは 60fps のときの 1 フレームあたり
const SIZE = 250
const radius = 30
const centerScale = 1.0
const range = 0.5
const speed = 0.1

let angle = 0

const draw = (ctx: CanvasRenderingContext2D) => {
  const scale = centerScale + Math.sin(angle) * range
  ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.beginPath()
  ctx.arc(SIZE / 2, SIZE / 2, radius * scale, 0, Math.PI * 2)
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
  // 動きを減らす設定では、もとの大きさ（倍率 1）で止める
  () => {
    angle = 0
    draw(ctx)
  },
)
