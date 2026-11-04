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

/** trackPointer の戻り値。dispose で見張りを外す */
export interface TrackedPointer extends Pointer {
  dispose: () => void
}

/**
 * 最後に見たポインターの位置（画面の座標）。組でパラメーターを替えたり切り替えたりして trackPointer を作り直すと、
 * ポインターを動かすまで真ん中に戻ってしまうので、作り直す前の位置を引き継ぐ
 */
let last: { clientX: number; clientY: number; inside: boolean } | undefined

/**
 * el の中でのポインターの位置。動かす前は真ん中にしておく（同じページで前に動かしていて、その位置が el の中なら、そこから始める）。
 * 大きさが変わったときに、まだ動かしていなければ真ん中に置き直す
 */
export const trackPointer = (
  el: HTMLElement,
  { units = 'px', touch = 'follow', leave = 'stay' }: Options = {},
): TrackedPointer => {
  const center = () =>
    units === 'px'
      ? { x: el.clientWidth / 2, y: el.clientHeight / 2 }
      : { x: 0, y: 0 }
  const pointer = { ...center(), inside: false } as TrackedPointer
  let moved = false

  /** 画面の座標を el の中の位置にして置く。outside が false なら、el の外のときは置かない */
  const place = (clientX: number, clientY: number, outside = true) => {
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    if (!outside && (x < 0 || y < 0 || x > rect.width || y > rect.height))
      return false
    pointer.x = units === 'px' ? x : (x / rect.width) * 2 - 1
    pointer.y = units === 'px' ? y : (y / rect.height) * 2 - 1
    moved = true
    return true
  }
  if (last && place(last.clientX, last.clientY, false))
    pointer.inside = last.inside

  const onMove = (e: PointerEvent) => {
    if (touch === 'ignore' && isHoverless()) return
    place(e.clientX, e.clientY)
    pointer.inside = true
    last = { clientX: e.clientX, clientY: e.clientY, inside: true }
  }
  const onLeave = () => {
    pointer.inside = false
    if (last) last.inside = false
    if (leave === 'stay') return
    Object.assign(pointer, center())
    moved = false
    last = undefined
  }
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerleave', onLeave)
  const observer = new ResizeObserver(() => {
    if (!moved) Object.assign(pointer, center())
  })
  observer.observe(el)

  pointer.dispose = () => {
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerleave', onLeave)
    observer.disconnect()
  }
  return pointer
}

/**
 * マウスを重ねられない端末で、マウスの代わりにゆっくり 8 の字を描く位置（units: 'unit' のとき）。
 * マウスの端末と、動きを減らす設定のとき（docs/demo-guide.md の 5 章の 3）は pointer をそのまま返す
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
