import gsap from 'gsap'

const stage = document.querySelector<HTMLElement>('.stage')!
const photo = stage.querySelector<HTMLImageElement>('.photo')!
const mask = stage.querySelector<HTMLElement>('.mask')!

// 幕の形を clip-path の inset（上 右 下 左）で持つ。右から伸びて全体を覆い、左へ縮んで消える
const hiddenRight = 'inset(0% 0% 0% 100%)'
const covered = 'inset(0% 0% 0% 0%)'
const hiddenLeft = 'inset(0% 100% 0% 0%)'

let timeline: gsap.core.Timeline | undefined

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
      '+=0.5',
    )
}

stage.addEventListener('click', play)
photo.decode().then(() => gsap.delayedCall(0.5, play), play)
