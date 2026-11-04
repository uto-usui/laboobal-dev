import { fiddleCanvas } from '../../shared/fiddle-canvas'
import { autoplayLoop } from '../../shared/motion'
import type { Mount, Params } from '../../shared/variants'

// もとの fiddle の canvas は 250×250。数字はそのままで、速さは 60fps のときの 1 フレームあたり
const SIZE = 250
const centerY = SIZE / 2
const speedX = 0.2

export const params = {
  range: { label: '上下の振れ幅', value: 80, min: 0, max: 120, step: 1 },
  speedY: {
    label: '1 フレームに進む角度（ラジアン）',
    value: 0.02,
    min: 0.002,
    max: 0.1,
    step: 0.001,
  },
} satisfies Params

export const mount: Mount<typeof params> = (stage, { range, speedY }) => {
  // ペン先の x。角度は x と同じだけ時間に比例して進むので、x から求められる（angle = x / speedX * speedY）
  let px = 0

  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.beginPath()
    ctx.moveTo(0, centerY)
    for (let x = 0; x <= px; x += 0.5) {
      ctx.lineTo(x, centerY + Math.sin((x / speedX) * speedY) * range)
    }
    ctx.lineWidth = 1
    ctx.strokeStyle = '#888888'
    ctx.stroke()
  }

  const canvas = fiddleCanvas(
    stage.querySelector<HTMLCanvasElement>('[data-fiddle-canvas]')!,
    SIZE,
    SIZE,
    draw,
  )

  const stop = autoplayLoop(
    (dt) => {
      px += speedX * 60 * dt
      // もとは右の端を越えても描き続け、線が見えなくなった。端まで来たら左から描き直す
      if (px > SIZE) px = 0
      draw(canvas.ctx)
    },
    // 動きを減らす設定では、端まで描き終えた波を見せる
    () => {
      px = SIZE
      draw(canvas.ctx)
    },
  )
  return () => {
    stop()
    canvas.dispose()
  }
}
