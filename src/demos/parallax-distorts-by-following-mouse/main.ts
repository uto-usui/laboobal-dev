import { gsap } from '../../shared/gsap'

const stage = document.querySelector<HTMLElement>('.stage')!

// 動かすたびに 1.2 秒かけて追いかけ直す。quickTo は同じ tween を作り直さずに行き先だけ変える
const items = [
  ...stage.querySelectorAll<HTMLElement>('[data-mouse-parallax]'),
].map((el) => {
  const to = (property: string) =>
    gsap.quickTo(el, property, { duration: 1.2, ease: 'power1.out' })
  return {
    factor: Number(el.dataset.mouseParallax),
    x: to('x'),
    y: to('y'),
    skewX: to('skewX'),
    skewY: to('skewY'),
  }
})

const follow = (dx: number, dy: number) => {
  for (const item of items) {
    const x = dx * item.factor
    item.x(x)
    item.y(dy * item.factor)
    // 横のずれに合わせて縦横どちらにも傾ける。平らな板が奥へ回り込むように見える
    item.skewX(x * 0.2)
    item.skewY(x * 0.2)
  }
}

stage.addEventListener('pointermove', (event) => {
  const rect = stage.getBoundingClientRect()
  follow(
    event.clientX - rect.left - rect.width / 2,
    event.clientY - rect.top - rect.height / 2,
  )
})

stage.addEventListener('pointerleave', () => follow(0, 0))
