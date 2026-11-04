import { autoplayLoop } from '../../shared/motion'
import { toRadian } from '../../shared/math'
import { fiddleCanvas } from './fiddle-canvas'

// もとの fiddle の canvas は 300×260。星は (100, 100) を中心に置き、1 フレームに 0.5 度ずつ回す
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

// 回った角度（度）
let rotation = 0

const draw = (ctx: CanvasRenderingContext2D) => {
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  ctx.save()
  ctx.translate(100, 100)
  ctx.rotate(toRadian(rotation))
  polyStar(ctx, 0, 0, 50, 5, 0.5, -90)
  ctx.fillStyle = color
  ctx.fill()
  ctx.restore()
}

const ctx = fiddleCanvas(
  document.querySelector<HTMLCanvasElement>('[data-fiddle-canvas]')!,
  WIDTH,
  HEIGHT,
  draw,
)

autoplayLoop(
  (dt) => {
    rotation += 0.5 * 60 * dt
    draw(ctx)
  },
  // 動きを減らす設定では、回る前の向き（頂点が真上）で止める
  () => {
    rotation = 0
    draw(ctx)
  },
)
