import { gsap } from 'gsap'
import { prefersReducedMotion } from '../../shared/dom'

const cells = document.querySelectorAll<HTMLElement>('[data-cell]')

if (!prefersReducedMotion()) {
  // 動かすのは --lift の 0 から 1 だけ。浮き上がる高さと縮み方は CSS で入れ物の大きさから決める
  gsap.to(cells, {
    '--lift': 1,
    duration: 1.25,
    repeat: -1,
    repeatDelay: 0.2,
    yoyo: true,
    // 行きすぎて戻る ease。波の先が一度沈んでから跳ね上がる
    ease: 'back.inOut(4)',
    stagger: {
      // 100 個の始まりのずれを、全部で 1 秒に収める。真ん中から外へ、格子の距離の順に
      amount: 1,
      grid: [10, 10],
      from: 'center',
    },
  })
}
