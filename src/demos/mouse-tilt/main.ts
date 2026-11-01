import gsap from 'gsap'

const stage = document.querySelector<HTMLElement>('.stage')!
const photo = stage.querySelector<HTMLElement>('.photo')!

// 写真ごとに奥行きを付ける。親の perspective と違い、写真の真ん中から見た傾きになる
gsap.set(photo, { transformPerspective: 1200 })

// マウスが動くたびに、1 秒かけて新しい角度へ向かい直す
const to = (prop: string) =>
  gsap.quickTo(photo, prop, { duration: 1, ease: 'power2.out' })
const rotateX = to('rotationX')
const rotateY = to('rotationY')
const x = to('x')
const y = to('y')

stage.addEventListener('pointermove', (e) => {
  const rect = stage.getBoundingClientRect()
  // 真ん中を 0 にした位置を、短い方の辺の半分で割る
  const half = Math.min(rect.width, rect.height) / 2
  const dx = (e.clientX - rect.left - rect.width / 2) / half
  const dy = (e.clientY - rect.top - rect.height / 2) / half
  // 真ん中から離れるほど、角度の掛け率も大きくなる（離れ具合の 2 乗で効く）
  const degree = Math.hypot(dx, dy) * 15
  // マウスのある側が奥へ沈む
  rotateX(-dy * degree)
  rotateY(dx * degree)
  x(dx * half * 0.01)
  y(dy * half * 0.01)
})

stage.addEventListener('pointerleave', () => {
  rotateX(0)
  rotateY(0)
  x(0)
  y(0)
})
