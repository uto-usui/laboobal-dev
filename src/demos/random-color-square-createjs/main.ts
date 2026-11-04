import { fiddleCanvas } from './fiddle-canvas'

// もとの fiddle の canvas は 300×260。座標は記事のコードのまま（図形を (50, 50) に置き、その中の (0, 0) と (100, 100) に描く）
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
    // 塗りの四角。drawRect(x, y, 幅, 高さ)
    ctx.fillStyle = colorA
    ctx.fillRect(0, 0, 50, 50)
    // 線の角丸四角。drawRoundRect(x, y, 幅, 高さ, 角丸の半径)
    ctx.beginPath()
    ctx.roundRect(100, 100, 50, 50, 10)
    ctx.lineWidth = 3
    ctx.strokeStyle = colorB
    ctx.stroke()
    ctx.translate(-50, -50)
  },
)
