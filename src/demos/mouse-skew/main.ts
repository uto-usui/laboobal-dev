import gsap from '../../shared/gsap'
import type { Mount, Params } from '../../shared/variants'

export const params = {
  factor: {
    label: 'マウスについていく割合',
    value: 0.2,
    min: 0,
    max: 0.5,
    step: 0.01,
  },
} satisfies Params

export const mount: Mount<typeof params> = (stage, { factor }) => {
  const area = stage.querySelector<HTMLElement>('.stage')!
  const photo = area.querySelector<HTMLElement>('.photo')!

  // マウスが動くたびに、1.2 秒かけて新しい値へ向かい直す
  const to = (prop: string) =>
    gsap.quickTo(photo, prop, { duration: 1.2, ease: 'power1.out' })
  const x = to('x')
  const y = to('y')
  const skewX = to('skewX')
  const skewY = to('skewY')

  const onMove = (e: PointerEvent) => {
    const rect = area.getBoundingClientRect()
    const dx = (e.clientX - rect.left - rect.width / 2) * factor
    const dy = (e.clientY - rect.top - rect.height / 2) * factor
    x(dx)
    y(dy)
    // ゆがみは横の動きだけから決める。横と縦に同じだけゆがませる
    skewX(dx * 0.05)
    skewY(dx * 0.05)
  }
  const onLeave = () => {
    x(0)
    y(0)
    skewX(0)
    skewY(0)
  }
  area.addEventListener('pointermove', onMove)
  area.addEventListener('pointerleave', onLeave)

  return () => {
    area.removeEventListener('pointermove', onMove)
    area.removeEventListener('pointerleave', onLeave)
    gsap.killTweensOf(photo)
  }
}
