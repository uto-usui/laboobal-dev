import { fiddleCanvas } from '../../shared/fiddle-canvas'
import { autoplayLoop } from '../../shared/motion'
import type { Mount, Params } from '../../shared/variants'

// もとの fiddle の canvas は 250×250。数字は記事のコードのままで、速さは 60fps のときの 1 フレームあたり
const SIZE = 250
const radius = 30
const centerScale = 1.0

export const params = {
  range: {
    label: '大きさの振れ幅（倍率）',
    value: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  speed: {
    label: '1 フレームの角度',
    value: 0.1,
    min: 0,
    max: 0.5,
    step: 0.01,
  },
} satisfies Params

export const mount: Mount<typeof params> = (stage, { range, speed }) => {
  let angle = 0

  const draw = (ctx: CanvasRenderingContext2D) => {
    const scale = centerScale + Math.sin(angle) * range
    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.beginPath()
    ctx.arc(SIZE / 2, SIZE / 2, radius * scale, 0, Math.PI * 2)
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
    // 動きを減らす設定では、もとの大きさ（倍率 1）で止める
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
