import { fiddleCanvas } from '../../shared/fiddle-canvas'
import { autoplayLoop } from '../../shared/motion'
import type { Mount, Params } from '../../shared/variants'

// もとの fiddle の canvas は 250×250。数字は記事のコードのままで、速さは 60fps のときの 1 フレームあたり
const SIZE = 250
const centerX = SIZE / 2
const centerY = SIZE / 2

export const params = {
  // 玉の半径 10 を足しても canvas（250×250）からはみ出さない 115 まで
  radius: { label: '軌道の半径', value: 100, min: 10, max: 115, step: 1 },
  speed: {
    label: '1 フレームに進む角度（ラジアン）',
    value: 0.01,
    min: 0,
    max: 0.1,
    step: 0.001,
  },
} satisfies Params

export const mount: Mount<typeof params> = (stage, { radius, speed }) => {
  let angle = 0

  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, SIZE, SIZE)
    // 軌道
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx.lineWidth = 1
    ctx.strokeStyle = 'lightgray'
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(
      centerX + Math.cos(angle) * radius,
      centerY + Math.sin(angle) * radius,
      10,
      0,
      Math.PI * 2,
    )
    ctx.fillStyle = '#888888'
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
      angle += speed * 60 * dt
      draw(canvas.ctx)
    },
    // 動きを減らす設定では、回り始めの位置（右の端）で止める
    () => {
      angle = 0
      draw(canvas.ctx)
    },
  )
  return () => {
    stop()
    canvas.dispose()
  }
}
