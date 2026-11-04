import { DEFAULT_BACKGROUND, paint, sketch } from './sketch'

const canvas = document.querySelector<HTMLCanvasElement>('.sketch canvas')!

/** 中心と横・縦の半径で楕円のパスを作る */
const ellipse = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
) => {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
}

sketch(canvas, 320, 320, (ctx) => {
  ctx.fillStyle = DEFAULT_BACKGROUND
  ctx.fillRect(0, 0, 320, 320)

  // ellipse(100, 100, 100, 50): 白で塗った横長の楕円
  ellipse(ctx, 100, 100, 50, 25)
  paint(ctx, '#fff', '#000')

  // ここから下は noFill()。同じ数でも、ellipseMode で読み方が変わる
  // CENTER: ellipse(200, 150, 50, 50) は中心と直径
  ellipse(ctx, 200, 150, 25, 25)
  paint(ctx, null, '#000')
  // RADIUS: ellipse(200, 150, 50, 50) は中心と半径
  ellipse(ctx, 200, 150, 50, 50)
  paint(ctx, null, '#000')
  // CORNER: ellipse(100, 200, 100, 100) は囲む箱の左上と直径
  ellipse(ctx, 150, 250, 50, 50)
  paint(ctx, null, '#000')
  // CORNERS: ellipse(0, 200, 100, 300) は囲む箱の左上と右下
  ellipse(ctx, 50, 250, 50, 50)
  paint(ctx, null, '#000')
})
