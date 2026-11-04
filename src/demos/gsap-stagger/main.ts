import { autoplay, gsap } from '../../shared/gsap'

const cells = document.querySelectorAll<HTMLElement>('[data-cell]')

// 動かすのは --lift の 0 から 1 だけ。浮き上がる高さと縮み方は CSS で入れ物の大きさから決める。動きを減らす設定では最初の姿で止める
autoplay(
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
  }),
)
