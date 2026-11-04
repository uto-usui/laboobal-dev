import { gsap } from '../../shared/gsap'
import { map } from '../../shared/math'
import type { Mount, Params } from '../../shared/variants'

export const params = {
  shift: {
    label: '帯を横にずらす割合',
    value: 0.32,
    min: 0,
    max: 1,
    step: 0.01,
  },
} satisfies Params

export const mount: Mount<typeof params> = (stage, { shift: ratio }) => {
  const root = stage.querySelector<HTMLElement>('.divided')!
  const positioners = gsap.utils.toArray<HTMLElement>('.positioner', root)

  const pointer = { x: 0, y: 0 }
  let moved = false

  const onMove = (event: PointerEvent) => {
    pointer.x = event.clientX
    pointer.y = event.clientY
    moved = true
  }

  // マウスが動いたフレームだけ tween を作る
  const tick = () => {
    if (!moved) return
    moved = false

    const rect = root.getBoundingClientRect()
    // 横は幅いっぱい、縦は上下の 15% を切った範囲を 0〜100 にする。上下の端まで行かなくても動ききる
    const px = map(pointer.x - rect.left, 0, rect.width, 0, 100)
    const py = map(
      pointer.y - rect.top,
      rect.height * 0.15,
      rect.height * 0.85,
      0,
      100,
    )
    const shift = ratio * (50 - px)

    gsap.to(positioners, {
      // 偶数の帯と奇数の帯で、横に逆へずらす
      x: (i: number) => (i % 2 ? -shift : shift),
      y: 0.4 * py,
      z: 0.12 * px,
      rotationY: -0.036 * (50 - px),
      rotationX: 0.036 * (50 - py),
      duration: 0.1,
      // 上から 2 本ずつ 0.07 秒遅れて追いつく。遅れた tween は始まるときに前の tween を止める（overwrite: 'auto'）
      stagger: (i: number) => Math.floor(i / 2) * 0.07,
      overwrite: 'auto',
    })
  }

  window.addEventListener('pointermove', onMove)
  gsap.ticker.add(tick)

  return () => {
    window.removeEventListener('pointermove', onMove)
    gsap.ticker.remove(tick)
    gsap.killTweensOf(positioners)
  }
}
