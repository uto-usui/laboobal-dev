import { onResize } from '../../shared/dom'
import { gsap } from '../../shared/gsap'
import { toRadian } from '../../shared/math'
import { autoplayLoop } from '../../shared/motion'
import type { Mount, Params } from '../../shared/variants'

export const params = {
  // もとは 1 フレームに 2 度（60fps で 120 度）
  speed: { label: '1 秒に進む角度', value: 120, min: 0, max: 360, step: 1 },
  depth: {
    label: '奥行きの倍率',
    value: 1.5,
    min: 0,
    max: 3,
    step: 0.1,
  },
} satisfies Params

export const mount: Mount<typeof params> = (stage, { speed, depth }) => {
  const box = stage.querySelector<HTMLElement>('[data-stage]')!
  const target = stage.querySelector<HTMLElement>('[data-target]')!

  let angle = 0
  let center = { x: 0, y: 0 }
  let radius = 0

  /** 上から見ると円を描く。横は sin、奥行きは cos */
  const draw = () => {
    const radian = toRadian(angle)
    gsap.set(target, {
      x: center.x + Math.sin(radian) * radius,
      y: center.y,
      z: Math.cos(radian) * radius * depth,
    })
  }

  const offResize = onResize(box, ({ width, height }) => {
    center = {
      x: width / 2 - target.offsetWidth / 2,
      y: height / 2 - target.offsetHeight / 2,
    }
    radius = height / 2
    // 手前に来たときに perspective を越えると、箱が目の後ろに回って消える。大きな画面では perspective を広げて、手前でも 2 倍の大きさまでにする
    box.style.perspective = `${Math.max(500, radius * depth * 2)}px`
    draw()
  })

  // 動きを減らす設定では、そのときの位置で止める
  const stop = autoplayLoop((dt) => {
    angle += speed * dt
    draw()
  }, draw)
  return () => {
    stop()
    offResize()
  }
}
