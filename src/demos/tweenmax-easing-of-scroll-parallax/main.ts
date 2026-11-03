import { gsap } from 'gsap'
import { ScrollToPlugin } from 'gsap/ScrollToPlugin'
import { clamp } from '../../shared/math'
import { prefersReducedMotion } from '../../shared/dom'

gsap.registerPlugin(ScrollToPlugin)

// - - ホイールのスクロールを、3 秒かけてゆっくり止まるようにする
// ホイール 1 段（120）でどれだけ進めるか。1 段で 720px 進む
const DISTANCE = 6
const SCROLL_TIME = 3

/** ホイール 1 段を 120 にそろえる。Chrome は 1 段で 100px、Firefox は 3 行で来る */
const notches = (event: WheelEvent) =>
  event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? event.deltaY * 40
    : event.deltaY * 1.2

if (!prefersReducedMotion()) {
  addEventListener(
    'wheel',
    (event) => {
      // 横のスクロールと、ctrl を押しながらの拡大（トラックパッドのピンチ）は、そのままにする
      if (event.deltaY === 0 || event.ctrlKey) return
      const max = document.documentElement.scrollHeight - innerHeight
      // 端まで来ていたら止めない。記事の iframe の中で、外のページへスクロールを渡すため
      if (
        (event.deltaY < 0 && scrollY <= 0) ||
        (event.deltaY > 0 && scrollY >= max)
      )
        return
      event.preventDefault()
      gsap.to(window, {
        duration: SCROLL_TIME,
        scrollTo: {
          y: clamp(scrollY + notches(event) * DISTANCE, 0, max),
          // スクロールバーやキーで動かされたら、そちらに任せて止める
          autoKill: true,
        },
        ease: 'power1.out',
        overwrite: true,
      })
    },
    // preventDefault するので passive にしない
    { passive: false },
  )
}

// - - スクロールに合わせて、点を倍率の分だけずらす
// 倍率をこの数で割って使う。大きいほど動きが小さい
const DELTA = 5
const SPEED = 1.5

const layers = [...document.querySelectorAll<HTMLElement>('[data-parallax]')]
const movers = layers.map((el) => {
  const ratio = Number(el.dataset.parallax) / DELTA
  return {
    el,
    // もとは、ずらしたあとの位置からずらす量を決めていたので、行き着く先が ratio / (1 + ratio) 倍になっていた。その量に合わせる
    ratio: ratio / (1 + ratio),
    y: gsap.quickTo(el, 'y', { duration: SPEED, ease: 'power1.out' }),
  }
})

addEventListener('scroll', () => {
  for (const { el, ratio, y } of movers) {
    // ずらした分を引いて、もとの位置が画面の上からどれだけ下にあるかを出す
    const top =
      el.getBoundingClientRect().top - Number(gsap.getProperty(el, 'y'))
    y(-top * ratio)
  }
})
