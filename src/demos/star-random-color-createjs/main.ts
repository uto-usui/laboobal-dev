import { toRadian } from '../../shared/math'
import { fiddleCanvas } from '../../shared/fiddle-canvas'

// もとの fiddle の canvas は 300×260。座標は記事のコードのまま（図形を (50, 50) に置き、その中の (50, 50) を中心に描く）
const WIDTH = 300
const HEIGHT = 260

/**
 * CreateJS の drawPolyStar(x, y, 半径, 頂点の数, 谷の深さ, 起点の角度) と同じ星の形を作る。
 * 外の頂点と谷を交互に結ぶ。谷は中心から 半径 × (1 - 谷の深さ) のところ
 */
const polyStar = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  sides: number,
  pointSize: number,
  angle: number,
) => {
  const step = Math.PI / sides
  const inner = radius * (1 - pointSize)
  let a = toRadian(angle)
  ctx.beginPath()
  ctx.moveTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius)
  for (let i = 0; i < sides; i++) {
    a += step
    ctx.lineTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner)
    a += step
    ctx.lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius)
  }
  ctx.closePath()
}

/** 0x000000〜0xFFFFFF のでたらめな色。読み込むたびに変わる */
const color = `#${Math.floor(Math.random() * 0xffffff)
  .toString(16)
  .padStart(6, '0')}`

fiddleCanvas(
  document.querySelector<HTMLCanvasElement>('[data-fiddle-canvas]')!,
  WIDTH,
  HEIGHT,
  (ctx) => {
    ctx.clearRect(0, 0, WIDTH, HEIGHT)
    polyStar(ctx, 50 + 50, 50 + 50, 50, 5, 0.5, -90)
    ctx.fillStyle = color
    ctx.fill()
  },
)
