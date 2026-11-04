import { autoplay, gsap } from '../../shared/gsap'
import { splitText } from '../../shared/split-text'

const title = document.querySelector<HTMLElement>('[data-split]')!
const { chars } = splitText(title)

// 1 文字ずつ上へ抜けて消え、yoyo で同じ順に逆再生して戻ってくる。動きを減らす設定では最初の姿で止める
autoplay(
  gsap.to(chars, {
    yPercent: -100,
    opacity: 0,
    ease: 'power3.in',
    stagger: { amount: 1 },
    repeat: -1,
    yoyo: true,
  }),
)
