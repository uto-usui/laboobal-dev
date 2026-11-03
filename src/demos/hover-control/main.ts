import gsap from '../../shared/gsap'
import { hoverControl } from '../../shared/a/hover-control'

for (const row of document.querySelectorAll<HTMLElement>('.row')) {
  const fill = row.querySelector('.fill')
  hoverControl(
    row,
    () => gsap.to(fill, { scaleX: 1, duration: 0.6, ease: 'expo.out' }),
    () => gsap.to(fill, { scaleX: 0, duration: 0.5, ease: 'expo.inOut' }),
  )
}
