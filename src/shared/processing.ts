import { fitCanvas, onResize } from './dom'

// Processing.js で書いていたスケッチ（processing-js-* のデモ）を canvas 2D で描くための小さな道具

/** Processing の size() を呼んだだけのときの背景（グレー 204） */
export const DEFAULT_BACKGROUND = 'rgb(204 204 204)'

/**
 * Processing の size(width, height) の代わり。canvas を表示の大きさと devicePixelRatio に合わせ、
 * draw には width×height の座標のまま描ける ctx を渡す。大きさが変わるたびに描き直す。
 * 描く前に、Processing の既定（白で塗る、黒の 1px の線）にしておく。
 * 返す ctx はその座標のままなので、毎フレーム描き足すスケッチは draw() の外でもそのまま描ける。redraw で全体を描き直す
 */
export const sketch = (
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
) => {
  const ctx = canvas.getContext('2d')!
  let scale = 0
  const redraw = () => {
    if (!scale) return
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.globalAlpha = 1
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1
    ctx.clearRect(0, 0, width, height)
    draw(ctx)
  }
  onResize(canvas, () => {
    const { width: shown, dpr } = fitCanvas(canvas)
    scale = (shown / width) * dpr
    redraw()
  })
  return { ctx, redraw }
}

/** Processing の colorMode(HSB, 360, 100, 100, 100) の色を、canvas に渡せる rgb() にする */
export const hsb = (h: number, s: number, b: number, a = 100) => {
  const v = b / 100
  const c = v * (s / 100)
  const k = (n: number) => (n + h / 60) % 6
  const f = (n: number) =>
    Math.round((v - c * Math.max(0, Math.min(k(n), 4 - k(n), 1))) * 255)
  return `rgb(${f(5)} ${f(3)} ${f(1)} / ${a / 100})`
}

/** 今のパスを、Processing のように塗りと線で描く。null は noFill() や noStroke() */
export const paint = (
  ctx: CanvasRenderingContext2D,
  fill: string | null,
  stroke: string | null,
) => {
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.stroke()
  }
}
