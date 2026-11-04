import { fiddleCanvas } from '../../shared/fiddle-canvas'
import { autoplayLoop } from '../../shared/motion'
import type { Mount, Params } from '../../shared/variants'

// もとの fiddle の canvas は 250×250。数字は記事のコードのままで、速さは 60fps のときの 1 フレームあたり
const SIZE = 250
const radius = 30
const centerY = 100
const xSpeed = 1

export const params = {
  range: { label: '上下の振れ幅', value: 50, min: 0, max: 100, step: 1 },
  ySpeed: {
    label: '1 フレームに進む角度（ラジアン）',
    value: 0.05,
    min: 0,
    max: 0.3,
    step: 0.005,
  },
} satisfies Params

export const mount: Mount<typeof params> = (stage, { range, ySpeed }) => {
  const ball = { x: 0, y: centerY }
  let angle = 0

  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.beginPath()
    ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2)
    ctx.fillStyle = '#aaaaaa'
    ctx.fill()
  }

  const canvas = fiddleCanvas(
    stage.querySelector<HTMLCanvasElement>('[data-fiddle-canvas]')!,
    SIZE,
    SIZE,
    draw,
  )

  const stop = autoplayLoop(
    (dt) => {
      const frames = 60 * dt
      ball.x += xSpeed * frames
      ball.y = centerY + Math.sin(angle) * range
      angle += ySpeed * frames
      // 右の端を越えたら左の端へ戻す
      if (ball.x > SIZE) ball.x = 0
      draw(canvas.ctx)
    },
    // 動きを減らす設定では、真ん中を通るところで止める。y は同じ道の上に置く
    () => {
      ball.x = SIZE / 2
      angle = (ball.x / xSpeed) * ySpeed
      ball.y = centerY + Math.sin(angle) * range
      draw(canvas.ctx)
    },
  )
  return () => {
    stop()
    canvas.dispose()
  }
}
