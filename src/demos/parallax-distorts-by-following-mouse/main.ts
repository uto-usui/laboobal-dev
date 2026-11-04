import { gsap } from '../../shared/gsap'
import type { Mount, Params } from '../../shared/variants'

export const params = {
  skew: {
    label: 'ずれに対する傾きの割合',
    value: 0.2,
    min: 0,
    max: 0.6,
    step: 0.01,
  },
} satisfies Params

export const mount: Mount<typeof params> = (stage, { skew }) => {
  const area = stage.querySelector<HTMLElement>('.stage')!
  const targets = [
    ...area.querySelectorAll<HTMLElement>('[data-mouse-parallax]'),
  ]

  // 動かすたびに 1.2 秒かけて追いかけ直す。quickTo は同じ tween を作り直さずに行き先だけ変える
  const items = targets.map((el) => {
    const to = (property: string) =>
      gsap.quickTo(el, property, { duration: 1.2, ease: 'power1.out' })
    return {
      factor: Number(el.dataset.mouseParallax),
      x: to('x'),
      y: to('y'),
      skewX: to('skewX'),
      skewY: to('skewY'),
    }
  })

  const follow = (dx: number, dy: number) => {
    for (const item of items) {
      const x = dx * item.factor
      item.x(x)
      item.y(dy * item.factor)
      // 横のずれに合わせて縦横どちらにも傾ける。平らな板が奥へ回り込むように見える
      item.skewX(x * skew)
      item.skewY(x * skew)
    }
  }

  const onMove = (event: PointerEvent) => {
    const rect = area.getBoundingClientRect()
    follow(
      event.clientX - rect.left - rect.width / 2,
      event.clientY - rect.top - rect.height / 2,
    )
  }
  const onLeave = () => follow(0, 0)
  area.addEventListener('pointermove', onMove)
  area.addEventListener('pointerleave', onLeave)

  return () => {
    area.removeEventListener('pointermove', onMove)
    area.removeEventListener('pointerleave', onLeave)
    gsap.killTweensOf(targets)
  }
}
