import { DEFAULT_BACKGROUND, sketch } from '../../shared/processing'

const canvas = document.querySelector<HTMLCanvasElement>('.sketch canvas')!

sketch(canvas, 480, 320, (ctx) => {
  ctx.fillStyle = DEFAULT_BACKGROUND
  ctx.fillRect(0, 0, 480, 320)

  // point(x, y): 1px の点
  ctx.fillStyle = '#000'
  for (const [x, y] of [
    [50, 50],
    [120, 120],
    [300, 250],
  ]) {
    ctx.fillRect(x - 0.5, y - 0.5, 1, 1)
  }

  // line(x1, y1, x2, y2)。lineCap は strokeCap の ROUND、SQUARE、PROJECT にあたる
  const line = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    cap: CanvasLineCap = 'round',
  ) => {
    ctx.lineCap = cap
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  line(0, 200, 300, 50)
  line(400, 200, 100, 50)
  line(200, 300, 300, 20)

  // strokeWeight(20) にして、線の端の形を 3 通り
  ctx.lineWidth = 20
  line(20, 230, 80, 230, 'round')
  // SQUARE は端でちょうど切る
  line(20, 260, 80, 260, 'butt')
  // PROJECT は線の太さの半分だけ端を伸ばす
  line(20, 290, 80, 290, 'square')
})
