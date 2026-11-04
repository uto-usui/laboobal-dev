import { random, toRadian } from '../../shared/math'
import { hsb, sketch } from './sketch'

const canvas = document.querySelector<HTMLCanvasElement>('.sketch canvas')!
const w = 320
const h = 320
const rectW = 10

// 大きさが変わっても同じ色で描き直せるよう、乱数は最初に 1 回だけ引いておく
const colors = Array.from({ length: 20 }, () =>
  hsb(random(150, 250), 55, 70, 30),
)

sketch(canvas, w, h, (ctx) => {
  ctx.fillStyle = hsb(180, 35, 80, 20)
  ctx.fillRect(0, 0, w, h)

  ctx.translate(w / 2, h / 2)
  colors.forEach((color, i) => {
    ctx.fillStyle = color
    // save で真ん中の座標を取っておき、i × 30 度回して i × 10 だけ外へ出して描き、restore で真ん中に戻す。
    // 毎回真ん中から測るので、角度と距離が少しずつ増えて渦になる
    ctx.save()
    ctx.rotate(toRadian(i * 30))
    ctx.translate(10 * i, 0)
    ctx.fillRect(-rectW / 2, -rectW / 2, rectW, rectW)
    ctx.restore()
  })
})
