import { autoplayLoop } from '../../shared/motion'
import { random } from '../../shared/math'

/** min〜max の整数。両端も出る */
const randomInt = (min: number, max: number) => Math.floor(random(min, max + 1))

// codrops の glitchFx.js の既定の値。時間は秒
// 震えだすまでの待ち時間。最初の 1 回だけは短めにして、開いてすぐに震えるようにする
const START = { min: 0.5, max: 10 }
const FIRST_START = { min: 0.5, max: 2 }
// 1 つの姿でいる時間
const STATE = { min: 0.05, max: 0.1 }
// 1 回に何度ずらすか
const ITERATIONS = 5

const glitchValue = () =>
  `translate3d(${randomInt(-5, 5)}px, ${randomInt(-5, 5)}px, 0) rotate(${randomInt(-2, 2)}deg)`

const items = [...document.querySelectorAll<HTMLElement>('[data-glitch]')].map(
  (el) => ({ el, iteration: 0, next: 0 }),
)

const reset = () => {
  for (const item of items) {
    item.el.style.transform = ''
    item.iteration = 0
    item.next = random(FIRST_START.min, FIRST_START.max)
  }
}
reset()

/**
 * もとは setTimeout をつないでいた。ここでは loop の経過時間で次に変える時刻を持つ。
 * 画面の外では loop ごと止まり、止まっていた間は経過時間に数えないので、戻ったときにまとめて震えない
 */
autoplayLoop(
  (_, elapsed) => {
    for (const item of items) {
      if (elapsed < item.next) continue
      if (item.iteration < ITERATIONS) {
        // 少しずらして傾けた姿にする
        item.el.style.transform = glitchValue()
        item.iteration++
        item.next = elapsed + random(STATE.min, STATE.max)
      } else {
        // 5 回ずらしたら元に戻し、次に震えるまで待つ
        item.el.style.transform = ''
        item.iteration = 0
        item.next = elapsed + random(START.min, START.max)
      }
    }
  },
  // 動きを減らす設定では震えさせず、ずれていない姿で止める。設定が戻ったら elapsed は 0 から数え直すので、待ち時間も選び直す
  reset,
)
