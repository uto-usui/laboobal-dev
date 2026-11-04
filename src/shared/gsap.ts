import { gsap } from 'gsap'
import { onReducedMotion } from './motion'
import { isRunning, onRunningChange } from './visibility'

// GSAP を使うデモは gsap をここから読む。画面の外にいる間は、そのページの GSAP の動きをまとめて止める。
// GSAP を読まないページに GSAP を読ませないよう、visibility.ts からは import しない。
// timeline を止めるだけだと GSAP の ticker が rAF を回し続けるので、ticker も眠らせる
const sync = (running: boolean) => {
  if (running) {
    gsap.ticker.wake()
    gsap.globalTimeline.resume()
  } else {
    gsap.globalTimeline.pause()
    gsap.ticker.sleep()
  }
}
if (!isRunning()) sync(false)
onRunningChange(sync)

/**
 * ひとりでに動き続ける tween や timeline を渡す。動きを減らす設定の間は、still（1 回分の進み具合 0〜1）の姿で止める。
 * 設定が戻ったらそこから動かす（決まりは motion.ts）
 */
export const autoplay = (animation: gsap.core.Animation, still = 0) =>
  onReducedMotion((reduced) => {
    if (reduced) animation.progress(still).pause()
    else animation.play()
  })

export { gsap }
export default gsap
