import { hoverControl } from '../../shared/a/hover-control'
import gsap from '../../shared/gsap'
import type { Mount } from '../../shared/variants'

export const mount: Mount = (stage) => {
  const rows = [...stage.querySelectorAll<HTMLElement>('.row')]
  const fills = rows.map((row) => row.querySelector('.fill'))
  const offs = rows.map((row, i) =>
    hoverControl(
      row,
      () => gsap.to(fills[i], { scaleX: 1, duration: 0.6, ease: 'expo.out' }),
      () => gsap.to(fills[i], { scaleX: 0, duration: 0.5, ease: 'expo.inOut' }),
    ),
  )
  return () => {
    for (const off of offs) off()
    gsap.killTweensOf(fills)
  }
}
