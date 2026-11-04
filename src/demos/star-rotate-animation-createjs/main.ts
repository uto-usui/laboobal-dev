import { polyStar, randomColor } from '../../groups/random-color/draw'
import { fiddleCanvas } from '../../shared/fiddle-canvas'
import { toRadian } from '../../shared/math'
import { autoplayLoop } from '../../shared/motion'
import type { Mount, Params } from '../../shared/variants'

// もとの fiddle の canvas は 300×260。星は (100, 100) を中心に置き、1 フレームに 0.5 度ずつ回す
const WIDTH = 300
const HEIGHT = 260

export const params = {
  // もとは 60fps で 1 フレームに 0.5 度
  speed: { label: '1 秒に回る角度', value: 30, min: 0, max: 360, step: 1 },
} satisfies Params

export const mount: Mount<typeof params> = (stage, { speed }) => {
  // 開くたび（切り替えて戻ったときも）に色が変わる
  const color = randomColor()
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

  const canvas = fiddleCanvas(
    stage.querySelector<HTMLCanvasElement>('[data-fiddle-canvas]')!,
    WIDTH,
    HEIGHT,
    draw,
  )
  const stop = autoplayLoop(
    (dt) => {
      rotation += speed * dt
      draw(canvas.ctx)
    },
    // 動きを減らす設定では、回る前の向き（頂点が真上）で止める
    () => {
      rotation = 0
      draw(canvas.ctx)
    },
  )
  return () => {
    stop()
    canvas.dispose()
  }
}
