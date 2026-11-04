import { polyStar, randomColor } from '../../groups/random-color/draw'
import { fiddleCanvas } from '../../shared/fiddle-canvas'
import type { Mount } from '../../shared/variants'

// もとの fiddle の canvas は 300×260。座標は記事のコードのまま（図形を (50, 50) に置き、その中の (50, 50) を中心に描く）
const WIDTH = 300
const HEIGHT = 260

export const mount: Mount = (stage) => {
  // 開くたび（切り替えて戻ったときも）に色が変わる
  const color = randomColor()

  const { dispose } = fiddleCanvas(
    stage.querySelector<HTMLCanvasElement>('[data-fiddle-canvas]')!,
    WIDTH,
    HEIGHT,
    (ctx) => {
      ctx.clearRect(0, 0, WIDTH, HEIGHT)
      polyStar(ctx, 50 + 50, 50 + 50, 50, 5, 0.5, -90)
      ctx.fillStyle = color
      ctx.fill()
    },
  )
  return dispose
}
