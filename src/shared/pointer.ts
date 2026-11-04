import { isHoverless, prefersReducedMotion } from './dom'

export interface Pointer {
  /** units が 'px' なら el の左上を 0 とした px、'unit' なら真ん中が 0 で端が -1 と 1 */
  x: number
  y: number
  /** ポインターが el の上にあるか */
  inside: boolean
}

interface Options {
  units?: 'px' | 'unit'
  /**
   * 'follow' は指でなぞっても追う。'ignore' はマウスを重ねられない端末（`(hover: none)`）では動きを拾わない。
   * pointerType では分けない。タッチ画面付きの PC で、ペンや指の操作まで捨ててしまうため
   */
  touch?: 'follow' | 'ignore'
  /** 'center' は el の外に出たら真ん中に戻す。'stay' は最後の位置に残す */
  leave?: 'center' | 'stay'
}

/**
 * el の中でのポインターの位置。動かす前は真ん中にしておく。
 * 大きさが変わったときに、まだ動かしていなければ真ん中に置き直す
 */
export const trackPointer = (
  el: HTMLElement,
  { units = 'px', touch = 'follow', leave = 'stay' }: Options = {},
): Pointer => {
  const center = () =>
    units === 'px'
      ? { x: el.clientWidth / 2, y: el.clientHeight / 2 }
      : { x: 0, y: 0 }
  const pointer: Pointer = { ...center(), inside: false }
  let moved = false

  el.addEventListener('pointermove', (e) => {
    if (touch === 'ignore' && isHoverless()) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    pointer.x = units === 'px' ? x : (x / rect.width) * 2 - 1
    pointer.y = units === 'px' ? y : (y / rect.height) * 2 - 1
    pointer.inside = true
    moved = true
  })
  el.addEventListener('pointerleave', () => {
    pointer.inside = false
    if (leave === 'stay') return
    Object.assign(pointer, center())
    moved = false
  })
  new ResizeObserver(() => {
    if (!moved) Object.assign(pointer, center())
  }).observe(el)
  return pointer
}

/**
 * マウスを重ねられない端末で、マウスの代わりにゆっくり 8 の字を描く位置（units: 'unit' のとき）。
 * マウスの端末と、動きを減らす設定のとき（motion.ts の決まりの 3）は pointer をそのまま返す
 */
export const pointerOrWander = (
  pointer: Pointer,
  elapsed: number,
  amount = 0.6,
) =>
  isHoverless() && !pointer.inside && !prefersReducedMotion()
    ? {
        x: Math.sin(elapsed * 0.5) * amount,
        y: Math.sin(elapsed * 0.8) * amount * 0.6,
      }
    : pointer
