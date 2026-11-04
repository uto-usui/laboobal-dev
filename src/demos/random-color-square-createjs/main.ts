import { randomColor } from '../../groups/random-color/draw'
import { fiddleCanvas } from '../../shared/fiddle-canvas'
import type { Mount } from '../../shared/variants'

// もとの fiddle の canvas は 300×260。座標は記事のコードのまま（図形を (50, 50) に置き、その中の (0, 0) と (100, 100) に描く）
const WIDTH = 300
const HEIGHT = 260

export const mount: Mount = (stage) => {
  // 開くたび（切り替えて戻ったときも）に色が変わる
  const colorA = randomColor()
  const colorB = randomColor()

  const { dispose } = fiddleCanvas(
    stage.querySelector<HTMLCanvasElement>('[data-fiddle-canvas]')!,
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
  return dispose
}
