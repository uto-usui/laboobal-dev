import LocomotiveScroll from 'locomotive-scroll'
import 'locomotive-scroll/locomotive-scroll.css'
import { loop, onResize, prefersReducedMotion } from '../../shared/dom'
import { damp } from '../../shared/math'

const root = document.querySelector<HTMLElement>('.sm')!
const reduced = prefersReducedMotion()

const scroll = new LocomotiveScroll({
  lenisOptions: {
    smoothWheel: !reduced,
    // Lenis は端まで来ていても wheel を preventDefault する。端からさらに外へ回したときは false を返して
    // Lenis に渡さず、記事の iframe の外のページへスクロールを渡す
    virtualScroll: ({ deltaY }) => {
      const max = document.documentElement.scrollHeight - innerHeight
      return !(
        (deltaY < 0 && scrollY <= 0) ||
        (deltaY > 0 && scrollY >= max - 1)
      )
    },
  },
  // ページの背景の色相を、スクロールの進み具合で 2 周させる
  scrollCallback: ({ progress }) => {
    root.style.setProperty('--turn', String(progress || 0))
  },
})

/*
 * 遅れて追いつく視差（locomotive-scroll 4 の data-scroll-delay）。5 にはないので自前で動かす。
 * 目標の位置は 4 と同じく「画面の中心から要素の中心までの距離 × 速さ / 10」。
 * そこへ毎フレーム差の一部だけ近づく。data-lag は 4 の delay と同じ値（60fps で 1 フレームに近づく割合）
 */
const lagItems = [...root.querySelectorAll<HTMLElement>('[data-lag]')].map(
  (el) => ({
    el,
    speed: Number(el.dataset.lagSpeed) / 10,
    lambda: -60 * Math.log(1 - Number(el.dataset.lag)),
    center: 0,
    y: 0,
  }),
)

const measure = () => {
  for (const item of lagItems) {
    const rect = item.el.getBoundingClientRect()
    item.center = rect.top + window.scrollY - item.y + rect.height / 2
  }
}

const updateLag = (dt: number) => {
  const middle = window.scrollY + window.innerHeight / 2
  for (const item of lagItems) {
    const target = (item.center - middle) * item.speed
    item.y = reduced ? target : damp(item.y, target, item.lambda, dt)
    item.el.style.translate = `0 ${item.y.toFixed(2)}px`
  }
}

onResize(root, () => {
  measure()
  updateLag(1)
})
loop((dt) => updateLag(dt))

root
  .querySelector('.sm-pagetop')!
  .addEventListener('click', () => scroll.scrollTo(0))
