import gsap from '../../shared/gsap'
import { whenVisible } from '../../shared/visibility'

const stage = document.querySelector<HTMLElement>('.stage')!
const photo = stage.querySelector<HTMLImageElement>('.photo')!

// 写真を clip-path の inset（上 右 下 左）で切り抜く。右を 100% 削った幅 0 から、削りを 0 にして全体を見せる
const hidden = 'inset(0% 100% 0% 0%)'
const shown = 'inset(0% 0% 0% 0%)'

let timeline: gsap.core.Timeline | undefined

const show = () => {
  timeline?.kill()
  timeline = gsap
    .timeline()
    .to(photo, { clipPath: shown, duration: 1, ease: 'expo.out' })
}

// もう一度: いったん左へ畳んでから、また開く
const replay = () => {
  timeline?.kill()
  timeline = gsap
    .timeline()
    .to(photo, { clipPath: hidden, duration: 1, ease: 'expo.out' })
    .to(photo, { clipPath: shown, duration: 1, ease: 'expo.out' })
}

stage.addEventListener('click', replay)
// 記事の中で画面に入ってから再生する。読み込んだ時点で再生すると、読む人が来る前に終わっている
const start = () => whenVisible(() => gsap.delayedCall(0.5, show))
photo.decode().then(start, start)
