import { gsap } from '../../shared/gsap'
import { prefersReducedMotion } from '../../shared/dom'
import { splitText } from '../../shared/split-text'

const title = document.querySelector<HTMLElement>('[data-split]')!
const { chars } = splitText(title)

if (!prefersReducedMotion()) {
  // 1 文字ずつ上へ抜けて消え、yoyo で同じ順に逆再生して戻ってくる
  gsap.to(chars, {
    yPercent: -100,
    opacity: 0,
    ease: 'power3.in',
    stagger: { amount: 1 },
    repeat: -1,
    yoyo: true,
  })
}
