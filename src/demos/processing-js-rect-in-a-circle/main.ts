import { random, toRadian } from '../../shared/math'
import { hsb, sketch } from '../../shared/processing'
import type { Mount } from '../../shared/variants'

const w = 320
const h = 320
const rectW = 10
const num = 20
// 隣の正方形までの距離。もとは int の割り算なので切り捨てる（120 / 19 は 6）
const gutter = Math.trunc((w - rectW * num) / (num - 1)) + rectW

export const mount: Mount = (stage) => {
  // 大きさが変わっても同じ色で描き直せるよう、乱数は最初に 1 回だけ引いておく
  const colors = Array.from({ length: num }, () =>
    hsb(random(150, 250), 55, 70, 40),
  )

  return sketch(stage.querySelector('canvas')!, w, h, (ctx) => {
    ctx.fillStyle = hsb(180, 35, 80, 20)
    ctx.fillRect(0, 0, w, h)

    // 描くたびに、座標の原点を gutter だけ進めてから 360 / num 度回す。
    // 進む向きが少しずつ曲がるので、正方形は輪になって原点に戻ってくる
    ctx.translate(w / 2, h / 2)
    for (const color of colors) {
      ctx.fillStyle = color
      ctx.fillRect(-rectW / 2, -rectW / 2, rectW, rectW)
      ctx.translate(gutter, 0)
      ctx.rotate(toRadian(360 / num))
    }
  }).dispose
}
