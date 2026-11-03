import gsap from '../../shared/gsap'

const stage = document.querySelector<HTMLElement>('.stage')!
const photo = stage.querySelector<HTMLElement>('.photo')!

// マウスの動きの何割だけ写真を動かすか
const factor = 0.2

// マウスが動くたびに、1.2 秒かけて新しい値へ向かい直す
const to = (prop: string) =>
  gsap.quickTo(photo, prop, { duration: 1.2, ease: 'power1.out' })
const x = to('x')
const y = to('y')
const skewX = to('skewX')
const skewY = to('skewY')

stage.addEventListener('pointermove', (e) => {
  const rect = stage.getBoundingClientRect()
  const dx = (e.clientX - rect.left - rect.width / 2) * factor
  const dy = (e.clientY - rect.top - rect.height / 2) * factor
  x(dx)
  y(dy)
  // ゆがみは横の動きだけから決める。横と縦に同じだけゆがませる
  skewX(dx * 0.05)
  skewY(dx * 0.05)
})

stage.addEventListener('pointerleave', () => {
  x(0)
  y(0)
  skewX(0)
  skewY(0)
})
