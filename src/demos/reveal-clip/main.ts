import gsap from '../../shared/gsap'
import { prefersReducedMotion } from '../../shared/dom'
import type { Mount, Params } from '../../shared/variants'
import { whenVisible } from '../../shared/visibility'

// 写真を clip-path の inset（上 右 下 左）で切り抜く。右を 100% 削った幅 0 から、削りを 0 にして全体を見せる
const hidden = 'inset(0% 100% 0% 0%)'
const shown = 'inset(0% 0% 0% 0%)'

export const params = {
  duration: { label: '開く秒数', value: 1, min: 0.2, max: 3, step: 0.1 },
} satisfies Params

export const mount: Mount<typeof params> = (stage, { duration }) => {
  const root = stage.querySelector<HTMLElement>('.stage')!
  const photo = root.querySelector<HTMLImageElement>('.photo')!
  let disposed = false
  let timeline: gsap.core.Timeline | undefined
  let delayed: gsap.core.Tween | undefined
  let cancelVisible = () => {}

  const show = () => {
    timeline?.kill()
    timeline = gsap
      .timeline()
      .to(photo, { clipPath: shown, duration, ease: 'expo.out' })
  }

  // もう一度: いったん左へ畳んでから、また開く
  const replay = () => {
    timeline?.kill()
    timeline = gsap
      .timeline()
      .to(photo, { clipPath: hidden, duration, ease: 'expo.out' })
      .to(photo, { clipPath: shown, duration, ease: 'expo.out' })
  }

  root.addEventListener('click', replay)
  // 記事の中で画面に入ってから再生する。読み込んだ時点で再生すると、読む人が来る前に終わっている。
  // 動きを減らす設定では再生せず、開いた姿を見せる。replay は読む人が押すので動かす
  const start = () => {
    if (disposed) return
    cancelVisible = whenVisible(() => {
      if (prefersReducedMotion()) gsap.set(photo, { clipPath: shown })
      else delayed = gsap.delayedCall(0.5, show)
    })
  }
  photo.decode().then(start, start)

  return () => {
    disposed = true
    cancelVisible()
    delayed?.kill()
    timeline?.kill()
    root.removeEventListener('click', replay)
  }
}
