import { isCoarsePointer } from './dom'
import { onRunningChange } from './visibility'

/**
 * 指で引っぱるデモが、記事を読む人の指のスクロールを奪わないようにする。
 * 記事に iframe で埋め込んだとき、デモの上を縦になぞっても記事を読み進められるようにするため。
 *
 * - ふだんは el を touch-action: pan-y にする。横に動かし始めたらデモが受け取り、そのまま縦にも引っぱれる。
 *   縦に動かし始めたらページのスクロールになる（デモには pointercancel が届く）
 * - 指でタップすると touch-action: none にして、縦に動かし始めても引っぱれるようにする。
 *   指を離して 4 秒たつか、デモが画面の外に出たら pan-y に戻す
 * - touch-action は触り始めたときの値で決まるので、触っている途中で替えてもその操作には効かない。替えるのは操作と操作のあいだ
 * - タッチが主な端末では、左上に「tap to drag」の添え書きを出す（タップすると消え、戻すとまた出る）
 * - マウスの操作は何も変わらない。touch-action はタッチにしか効かない
 *
 * ホバーで動くだけのデモ（マウスを追う、傾けるなど）は、CSS で touch-action: pan-y にすればよい。これは要らない
 */
export const touchGate = (el: HTMLElement) => {
  // タップとみなす指の動きの大きさ（px）
  const TAP_SLOP = 10
  const IDLE_MS = 4000

  let hint: HTMLElement | undefined
  if (isCoarsePointer()) {
    hint = document.createElement('p')
    hint.className = 'demo-hint'
    hint.textContent = 'tap to drag'
    ;(document.querySelector('main.demo') ?? document.body).append(hint)
  }

  let timer = 0
  const arm = (armed: boolean) => {
    clearTimeout(timer)
    el.style.touchAction = armed ? 'none' : 'pan-y'
    if (hint) hint.hidden = armed
  }
  arm(false)

  let start: { id: number; x: number; y: number } | undefined
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return
    clearTimeout(timer)
    start = { id: e.pointerId, x: e.clientX, y: e.clientY }
  })
  el.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch') return
    const tapped =
      start?.id === e.pointerId &&
      Math.hypot(e.clientX - start.x, e.clientY - start.y) < TAP_SLOP
    start = undefined
    if (tapped || el.style.touchAction === 'none') {
      arm(true)
      timer = window.setTimeout(() => arm(false), IDLE_MS)
    }
  })
  el.addEventListener('pointercancel', () => (start = undefined))
  onRunningChange((running) => {
    if (!running) arm(false)
  })
}
