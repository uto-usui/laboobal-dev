import { random, toRadian } from '../../shared/math'
import { hsb, paint, sketch } from '../../shared/processing'

const canvas = document.querySelector<HTMLCanvasElement>('.sketch canvas')!
const width = 320
const height = 320
// 2 つの星は同じ色。開くたびに色相を選び直す
const color = hsb(random(150, 250), 50, 85, 65)

const star = (
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
) => {
  // 頂点は山と谷が 5 つずつ。山は中心から幅の 1/4、谷はその半分
  const num = 5 * 2
  const rOut = width / 2 / 2
  const rIn = rOut / 2
  ctx.save()
  ctx.translate(centerX, centerY)
  // 1 つ目の山を真上に向ける
  ctx.rotate(toRadian(-90))
  ctx.beginPath()
  for (let i = 0; i < num; i++) {
    // 偶数は山、奇数は谷
    const r = i % 2 === 0 ? rOut : rIn
    const angle = toRadian((360 / num) * i)
    ctx.lineTo(r * Math.cos(angle), r * Math.sin(angle))
  }
  ctx.closePath()
  paint(ctx, color, '#000')
  ctx.restore()
}

sketch(canvas, width, height, (ctx) => {
  ctx.fillStyle = hsb(180, 35, 80, 20)
  ctx.fillRect(0, 0, width, height)
  star(ctx, width / 2 / 2, height / 2)
  star(ctx, width / 2 + width / 2 / 2, height / 2)
})
