import { isCoarsePointer } from '../dom'

export interface Pointer {
  /** el の中での位置。真ん中が 0、左と上の端が -1、右と下の端が 1 */
  x: number
  y: number
  /** マウスが el の上にあるか */
  inside: boolean
}

/**
 * マウスの位置を el の大きさに対する割合で持つ。外に出たら真ん中に戻す。
 * タッチの端末ではマウスが来ないので、wander で自動に動かす
 */
export const trackPointer = (el: HTMLElement): Pointer => {
  const pointer: Pointer = { x: 0, y: 0, inside: false }
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return
    const rect = el.getBoundingClientRect()
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = ((e.clientY - rect.top) / rect.height) * 2 - 1
    pointer.inside = true
  })
  el.addEventListener('pointerleave', () => {
    pointer.x = 0
    pointer.y = 0
    pointer.inside = false
  })
  return pointer
}

/**
 * タッチの端末で、マウスの代わりにゆっくり 8 の字を描く位置。
 * マウスの端末では pointer をそのまま返す
 */
export const pointerOrWander = (
  pointer: Pointer,
  elapsed: number,
  amount = 0.6,
) =>
  isCoarsePointer() && !pointer.inside
    ? {
        x: Math.sin(elapsed * 0.5) * amount,
        y: Math.sin(elapsed * 0.8) * amount * 0.6,
      }
    : pointer
