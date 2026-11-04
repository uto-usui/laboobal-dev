import { onReducedMotion } from '../../shared/motion'
import { onRunningChange } from '../../shared/visibility'

const wrap = document.querySelector<HTMLElement>('[data-wrap]')!
const video = document.querySelector<HTMLVideoElement>('[data-video]')!
const button = document.querySelector<HTMLButtonElement>('[data-sound]')!

let reduced = false
let running = true
// sound を押して、音を出しエフェクトを外している間
let clear = false

/**
 * 再生するかどうかを決め直す。ふだんは音を消して流し続ける。
 * 動きを減らす設定の間は、sound を押して読む人が始めたときだけ流す。画面の外では止める
 */
const shouldPlay = () => running && (!reduced || clear)

const sync = () => {
  if (shouldPlay()) {
    // 音のない動画は自動で再生できる。止められても、止まったコマにエフェクトはかかるので握りつぶす
    video.play().catch(() => {})
  } else if (video.readyState < video.HAVE_CURRENT_DATA) {
    // iOS の Safari は再生しないと最初のコマを読まないので、一度再生してすぐ止める
    video.play().then(
      () => {
        if (!shouldPlay()) video.pause()
      },
      () => {},
    )
  } else video.pause()
}

onReducedMotion((value) => {
  reduced = value
  sync()
})
onRunningChange((value) => {
  running = value
  sync()
})

// もとの YTPToggleVolume と YTPToggleFilters にあたる。押すたびに、音とエフェクトを一緒に切り替える
button.addEventListener('click', () => {
  clear = !clear
  video.muted = !clear
  wrap.toggleAttribute('data-clear', clear)
  button.setAttribute('aria-pressed', String(clear))
  sync()
})
