import { gsap } from '../../shared/gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

for (const box of document.querySelectorAll<HTMLElement>('.range .box')) {
  const inner = box.querySelector<HTMLElement>('.inner')!
  gsap.to(inner, {
    // 見え始めから見え終わりまでに、はみ出した分を動ききる
    y: () => -(inner.offsetHeight - box.clientHeight),
    ease: 'none',
    scrollTrigger: {
      trigger: box,
      // 箱の上端が画面の下から 100px 入ったところから、箱の下端が画面の上から 100px のところまで
      start: 'top bottom-=100',
      end: 'bottom top+=100',
      // 0.5 秒遅れて追いつく。ホイールの 1 段ごとの飛びがならされる
      scrub: 0.5,
      toggleClass: 'is-show',
      invalidateOnRefresh: true,
    },
  })
}
