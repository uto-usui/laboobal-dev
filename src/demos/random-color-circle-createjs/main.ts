import { fiddleCanvas } from './fiddle-canvas'

// もとの fiddle の canvas は 300×260。座標は記事のコードのまま（図形を (50, 50) に置き、その中の (50, 50) と (100, 100) に描く）
const WIDTH = 300
const HEIGHT = 260

/** 0x000000〜0xFFFFFF のでたらめな色。読み込むたびに変わる */
const randomColor = () =>
  `#${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')}`

const colorA = randomColor()
const colorB = randomColor()

fiddleCanvas(
  document.querySelector<HTMLCanvasElement>('[data-fiddle-canvas]')!,
  WIDTH,
  HEIGHT,
  (ctx) => {
    ctx.clearRect(0, 0, WIDTH, HEIGHT)
    ctx.translate(50, 50)
    // 塗りの円
    ctx.beginPath()
    ctx.arc(50, 50, 30, 0, Math.PI * 2)
    ctx.fillStyle = colorA
    ctx.fill()
    // 線の円
    ctx.beginPath()
    ctx.arc(100, 100, 30, 0, Math.PI * 2)
    ctx.lineWidth = 3
    ctx.strokeStyle = colorB
    ctx.stroke()
    ctx.translate(-50, -50)
  },
)
