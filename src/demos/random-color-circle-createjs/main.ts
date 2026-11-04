import { randomColor } from '../../groups/random-color/draw'
import { fiddleCanvas } from '../../shared/fiddle-canvas'
import type { Mount } from '../../shared/variants'

// もとの fiddle の canvas は 300×260。座標は記事のコードのまま（図形を (50, 50) に置き、その中の (50, 50) と (100, 100) に描く）
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
  return dispose
}
