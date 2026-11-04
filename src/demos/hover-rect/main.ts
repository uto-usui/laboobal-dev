import { hoverControl } from '../../shared/a/hover-control'
import gsap from '../../shared/gsap'
import type { Mount } from '../../shared/variants'

export const mount: Mount = (stage) => {
  const cells = [...stage.querySelectorAll<HTMLElement>('.cell')]
  const offs = cells.map((cell) =>
    hoverControl(
      cell,
      () =>
        gsap.to(cell, {
          backgroundColor: '#ff6473',
          fontSize: 32,
          borderWidth: 20,
          duration: 0.6,
          ease: 'expo.out',
        }),
      () =>
        gsap.to(cell, {
          backgroundColor: '#25ecb7',
          fontSize: 16,
          borderWidth: 0,
          duration: 0.5,
          ease: 'expo.inOut',
        }),
    ),
  )
  return () => {
    for (const off of offs) off()
    gsap.killTweensOf(cells)
  }
}
