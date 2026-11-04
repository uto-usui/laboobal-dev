import gsap from '../../shared/gsap'
import { prefersReducedMotion } from '../../shared/dom'
import type { Mount, Params } from '../../shared/variants'
import { whenVisible } from '../../shared/visibility'

// 幕の形を clip-path の inset（上 右 下 左）で持つ。右から伸びて全体を覆い、左へ縮んで消える
const hiddenRight = 'inset(0% 0% 0% 100%)'
const covered = 'inset(0% 0% 0% 0%)'
const hiddenLeft = 'inset(0% 100% 0% 0%)'

export const params = {
  hold: {
    label: '幕で覆っている秒数',
    value: 0.5,
    min: 0,
    max: 2,
    step: 0.05,
  },
} satisfies Params

export const mount: Mount<typeof params> = (stage, { hold }) => {
  const root = stage.querySelector<HTMLElement>('.stage')!
  const photo = root.querySelector<HTMLImageElement>('.photo')!
  const mask = root.querySelector<HTMLElement>('.mask')!
  let disposed = false
  let timeline: gsap.core.Timeline | undefined
  let delayed: gsap.core.Tween | undefined
  let cancelVisible = () => {}

  const play = () => {
    timeline?.kill()
    timeline = gsap
      .timeline()
      .set(photo, { opacity: 0 })
      .fromTo(
        mask,
        { clipPath: hiddenRight },
        { clipPath: covered, duration: 0.75, ease: 'power1.out' },
      )
      // 幕が覆いきった瞬間に、裏で写真を出しておく
      .set(photo, { opacity: 1 })
      .to(
        mask,
        { clipPath: hiddenLeft, duration: 0.65, ease: 'power3.out' },
        `+=${hold}`,
      )
  }

  root.addEventListener('click', play)
  // 記事の中で画面に入ってから再生する。読み込んだ時点で再生すると、読む人が来る前に終わっている。
  // 動きを減らす設定では再生せず、写真を出した姿を見せる。replay は読む人が押すので動かす
  const start = () => {
    if (disposed) return
    cancelVisible = whenVisible(() => {
      if (prefersReducedMotion()) gsap.set(photo, { opacity: 1 })
      else delayed = gsap.delayedCall(0.5, play)
    })
  }
  photo.decode().then(start, start)

  return () => {
    disposed = true
    cancelVisible()
    delayed?.kill()
    timeline?.kill()
    root.removeEventListener('click', play)
  }
}
