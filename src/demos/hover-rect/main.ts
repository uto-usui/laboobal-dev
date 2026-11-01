import gsap from 'gsap'
import { hoverControl } from '../../shared/a/hover-control'

for (const cell of document.querySelectorAll<HTMLElement>('.cell')) {
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
  )
}
