import { DEFAULT_BACKGROUND, paint, sketch } from '../../shared/processing'
import type { Mount } from '../../shared/variants'

export const mount: Mount = (stage) =>
  sketch(stage.querySelector('canvas')!, 480, 320, (ctx) => {
    ctx.fillStyle = DEFAULT_BACKGROUND
    ctx.fillRect(0, 0, 480, 320)

    // strokeWeight(5) で rect(30, 100, 100, 180)
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.rect(30, 100, 100, 180)
    paint(ctx, '#fff', '#000')

    // 5 つ目の数は角の丸み。rect(350, 200, 50, 50, 10)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(350, 200, 50, 50, 10)
    paint(ctx, '#fff', '#000')

    // ここから下は noFill()。同じ 4 つの数でも、rectMode で読み方が変わる
    const outline = (x: number, y: number, w: number, h: number) => {
      ctx.beginPath()
      ctx.rect(x, y, w, h)
      paint(ctx, null, '#000')
    }
    // CORNER: rect(100, 150, 100, 100) は左上と幅・高さ
    outline(100, 150, 100, 100)
    // CORNERS: rect(350, 100, 400, 50) は 2 つの角
    outline(350, 50, 50, 50)
    // CENTER: rect(200, 150, 100, 100) は中心と幅・高さ
    outline(150, 100, 100, 100)
    // RADIUS: rect(200, 150, 100, 100) は中心と、幅・高さの半分
    outline(100, 50, 200, 200)

    // quad(38, 31, 86, 20, 69, 63, 30, 76): 4 つの頂点を自由に置く
    ctx.beginPath()
    ctx.moveTo(38, 31)
    ctx.lineTo(86, 20)
    ctx.lineTo(69, 63)
    ctx.lineTo(30, 76)
    ctx.closePath()
    paint(ctx, null, '#000')
  }).dispose
