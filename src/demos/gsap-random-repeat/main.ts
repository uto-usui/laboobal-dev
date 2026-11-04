import { autoplay, gsap } from '../../shared/gsap'

const card = document.querySelector<HTMLElement>('[data-card]')!

// repeatRefresh で、くり返すたびに random() を引き直す。前の回の終わりの姿から次の行き先へ進むので、途切れない。動きを減らす設定では最初の姿で止める
autoplay(
  gsap.to(card, {
    duration: 1,
    scale: 'random(0.5, 2)',
    rotationX: 'random(-360, 360)',
    rotationY: 'random(-360, 360)',
    rotationZ: 'random(-360, 360)',
    repeat: -1,
    repeatRefresh: true,
    // 出だしが速く、次の姿勢に吸い込まれるように止まる。止まりきった瞬間に次へ蹴り出される
    ease: 'power1.out',
  }),
)
