import { random } from '../../shared/math'
import { hsb, sketch } from '../../shared/processing'
import type { Mount } from '../../shared/variants'

const w = 320
const h = 320

export const mount: Mount = (stage) => {
  // 大きさが変わっても同じ絵を描き直せるよう、乱数は最初に 1 回だけ引いておく
  const squares = Array.from({ length: 300 }, () => ({
    color: hsb(random(150, 250), 55, 70, 35),
    size: random(5, 15),
    x: random(0, w),
    y: random(0, h),
  }))

  return sketch(stage.querySelector('canvas')!, w, h, (ctx) => {
    ctx.fillStyle = hsb(180, 35, 80, 20)
    ctx.fillRect(0, 0, w, h)
    for (const { color, size, x, y } of squares) {
      ctx.fillStyle = color
      ctx.fillRect(x, y, size, size)
    }
  }).dispose
}
