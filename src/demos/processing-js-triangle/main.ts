import { toRadian } from '../../shared/math'
import { DEFAULT_BACKGROUND, paint, sketch } from '../../shared/processing'
import type { Mount } from '../../shared/variants'

const SIZE = 320
const r = SIZE / 2
// stroke(100) は、colorMode(HSB, 360, ...) の中では 360 を白とする灰色になる（255 × 100 / 360）
const GRAY = 'rgb(71 71 71)'

export const mount: Mount = (stage) =>
  sketch(stage.querySelector('canvas')!, SIZE, SIZE, (ctx) => {
    ctx.fillStyle = DEFAULT_BACKGROUND
    ctx.fillRect(0, 0, SIZE, SIZE)

    // triangle(100, 50, 50, 150, 150, 150): 3 つの頂点を決めて描く
    ctx.beginPath()
    ctx.moveTo(100, 50)
    ctx.lineTo(50, 150)
    ctx.lineTo(150, 150)
    ctx.closePath()
    paint(ctx, '#fff', '#000')

    // 画面いっぱいの円
    ctx.beginPath()
    ctx.arc(r, r, r, 0, Math.PI * 2)
    paint(ctx, null, GRAY)

    // 円を 3 等分する点を結ぶ。-90 度回して、頂点を上に向ける
    ctx.save()
    ctx.translate(r, r)
    ctx.rotate(toRadian(-90))
    ctx.beginPath()
    for (let i = 0; i < 3; i++) {
      const angle = toRadian((360 * i) / 3)
      ctx.lineTo(r * Math.cos(angle), r * Math.sin(angle))
    }
    ctx.closePath()
    paint(ctx, null, GRAY)
    ctx.restore()
  }).dispose
