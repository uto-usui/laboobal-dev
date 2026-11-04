import { changeGate, isCoarsePointer, loop, onResize } from '../../shared/dom'
import { onReducedMotion } from '../../shared/motion'
import { damp } from '../../shared/math'

const root = document.querySelector<HTMLElement>('[data-smooth-root]')!
const content = document.querySelector<HTMLElement>('[data-content]')!

// 追いつく速さ。もとは 1 フレームに差の 8% だけ近づいていた。60fps でそれと同じになる値
const LAMBDA = -60 * Math.log(1 - 0.08)

let y = 0
let stop: (() => void) | undefined
const changed = changeGate(0.1)

// 中身を画面に貼り付けている間、ページの高さは外の箱が持つ
onResize(content, ({ height }) => {
  if (stop) root.style.height = `${height}px`
})

/**
 * ページのスクロールはブラウザに任せ、見た目の位置 y だけを、スクロールの位置へ遅れて追いつかせる。
 * ホイールを奪わないので、ページの端まで来たら、記事の iframe の外のページへそのままスクロールが渡る
 */
const enable = () => {
  root.toggleAttribute('data-on', true)
  root.style.height = `${content.offsetHeight}px`
  y = scrollY
  stop = loop((dt) => {
    y = damp(y, scrollY, LAMBDA, dt)
    if (Math.abs(scrollY - y) < 0.1) y = scrollY
    if (changed(y)) content.style.transform = `translate3d(0, ${-y}px, 0)`
  })
}

const disable = () => {
  stop?.()
  stop = undefined
  root.toggleAttribute('data-on', false)
  root.style.height = ''
  content.style.transform = ''
}

// 動きを減らす設定の間は、滑らかにせずふつうのスクロールにする（src/shared/motion.ts の決まりの 4）。
// 指で動かす端末も外す。指のスクロールにはもともと慣性があり、さらに遅らせると指から絵がずれる
onReducedMotion((reduced) => {
  disable()
  if (!reduced && !isCoarsePointer()) enable()
})
