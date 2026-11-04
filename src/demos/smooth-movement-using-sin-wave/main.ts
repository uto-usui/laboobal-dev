import { onResize } from '../../shared/dom'
import { gsap } from '../../shared/gsap'
import { map, toRadian } from '../../shared/math'
import { autoplayLoop } from '../../shared/motion'
import type { Mount, Params } from '../../shared/variants'

export const params = {
  // もとは 1 フレームに 2 度（60fps で 120 度）
  speed: { label: '1 秒に進む角度', value: 120, min: 0, max: 360, step: 1 },
} satisfies Params

export const mount: Mount<typeof params> = (stage, { speed }) => {
  const box = stage.querySelector<HTMLElement>('[data-stage]')!
  const target = stage.querySelector<HTMLElement>('[data-target]')!

  let angle = 0
  let center = { x: 0, y: 0 }
  let radius = 0

  /** sin は -1〜1 をなめらかに行き来する。端で遅く、真ん中で速い。同じ値で色相も 0〜180 を行き来させる */
  const draw = () => {
    const wave = Math.sin(toRadian(angle))
    gsap.set(target, {
      x: center.x + wave * radius,
      y: center.y,
      backgroundColor: `hsl(${map(wave, -1, 1, 0, 360) / 2} 70% 70%)`,
    })
  }

  const offResize = onResize(box, ({ width, height }) => {
    center = {
      x: width / 2 - target.offsetWidth / 2,
      y: height / 2 - target.offsetHeight / 2,
    }
    radius = height / 4
    draw()
  })

  const stop = autoplayLoop((dt) => {
    angle += speed * dt
    draw()
  }, draw)
  return () => {
    stop()
    offResize()
  }
}
