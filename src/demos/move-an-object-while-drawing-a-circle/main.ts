import { onResize } from '../../shared/dom'
import { gsap } from '../../shared/gsap'
import { toRadian } from '../../shared/math'
import { autoplayLoop } from '../../shared/motion'
import type { Mount, Params } from '../../shared/variants'

export const params = {
  // もとは 1 フレームに 2 度（60fps で 120 度）
  speed: { label: '1 秒に進む角度', value: 120, min: 0, max: 360, step: 1 },
} satisfies Params

export const mount: Mount<typeof params> = (stage, { speed }) => {
  const box = stage.querySelector<HTMLElement>('[data-stage]')!
  const ring = stage.querySelector<HTMLElement>('[data-ring]')!
  const target = stage.querySelector<HTMLElement>('[data-target]')!

  let angle = 0
  let center = { x: 0, y: 0 }
  let radius = 0

  /** 横を sin、縦を cos で動かすと、円の上を回る */
  const draw = () => {
    const radian = toRadian(angle)
    gsap.set(target, {
      x: center.x + Math.sin(radian) * radius,
      y: center.y + Math.cos(radian) * radius,
    })
  }

  const offResize = onResize(box, ({ width, height }) => {
    center = {
      x: width / 2 - target.offsetWidth / 2,
      y: height / 2 - target.offsetHeight / 2,
    }
    radius = height / 4
    // 線の太さ 1px の分を足して、線の真ん中を玉の中心が通るようにする
    ring.style.setProperty('--diameter', `${radius * 2 + 1}px`)
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
