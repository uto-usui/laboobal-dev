import { gsap } from 'gsap'
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

export { gsap }
export default gsap
