import { toRadian } from '../../shared/math'

/** 0x000000〜0xFFFFFF のでたらめな色 */
export const randomColor = () =>
  `#${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')}`

/**
 * CreateJS の drawPolyStar(x, y, 半径, 頂点の数, 谷の深さ, 起点の角度) と同じ星の形を作る。
 * 外の頂点と谷を交互に結ぶ。谷は中心から 半径 × (1 - 谷の深さ) のところ
 */
export const polyStar = (
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
