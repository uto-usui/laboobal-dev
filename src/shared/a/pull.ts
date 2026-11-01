export interface Pull {
  /** 押した点からの移動量（px）。離すと 0 に戻る */
  x: number
  y: number
  active: boolean
}

/**
 * el のどこを押しても、押した点からどれだけ引っぱったかを返す。
 * 要素そのものをつかむのではなく、画面のどこでもつまめるようにするため
 */
export const trackPull = (el: HTMLElement): Pull => {
  const pull: Pull = { x: 0, y: 0, active: false }
  let pointerId: number | undefined
  let startX = 0
  let startY = 0

  el.addEventListener('pointerdown', (e) => {
    if (pointerId !== undefined) return
    pointerId = e.pointerId
    startX = e.clientX
    startY = e.clientY
    pull.active = true
    // 指が要素の外に出ても、離すまで追い続ける
    el.setPointerCapture(e.pointerId)
  })
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId) return
    pull.x = e.clientX - startX
    pull.y = e.clientY - startY
  })
  const release = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return
    pointerId = undefined
    pull.x = 0
    pull.y = 0
    pull.active = false
  }
  el.addEventListener('pointerup', release)
  el.addEventListener('pointercancel', release)

  return pull
}
