import { onResize } from '../../shared/dom'
import { gsap } from '../../shared/gsap'
import { random, toRadian } from '../../shared/math'
import { autoplayLoop } from '../../shared/motion'
import type { Mount } from '../../shared/variants'

export const mount: Mount = (stage) => {
  const box = stage.querySelector<HTMLElement>('[data-stage]')!
  const target = stage.querySelector<HTMLElement>('[data-target]')!

  /**
   * x、y、z に、別々のでたらめな角度と速さを持たせる。速さは 1 秒に進む角度。
   * もとは 1 フレームに -2〜4 度（60fps で -120〜240 度）。速さの比がそろわないので、同じ道を二度となぞらない
   */
  const waves = {
    x: { angle: random(0, 360), speed: random(-120, 240) },
    y: { angle: random(0, 360), speed: random(-120, 240) },
    z: { angle: random(0, 360), speed: random(-120, 240) },
  }

  let center = { x: 0, y: 0 }
  let radius = 0

  const draw = () => {
    gsap.set(target, {
      x: center.x + Math.sin(toRadian(waves.x.angle)) * radius,
      y: center.y + Math.sin(toRadian(waves.y.angle)) * radius,
      z: Math.cos(toRadian(waves.z.angle)) * radius,
    })
  }

  const offResize = onResize(box, ({ width, height }) => {
    center = {
      x: width / 2 - target.offsetWidth / 2,
      y: height / 2 - target.offsetHeight / 2,
    }
    radius = height / 2
    // 手前で perspective を越えると箱が消えるので、大きな画面では perspective を広げる
    box.style.perspective = `${Math.max(500, radius * 2)}px`
    draw()
  })

  const stop = autoplayLoop(
    (dt) => {
      for (const wave of Object.values(waves)) wave.angle += wave.speed * dt
      draw()
    },
    // 動きを減らす設定では、箱を真ん中に置いて止める。でたらめな角度のままだと、画面の端で止まることがある
    () => {
      waves.x.angle = 0
      waves.y.angle = 0
      waves.z.angle = 90
      draw()
    },
  )
  return () => {
    stop()
    offResize()
  }
}
