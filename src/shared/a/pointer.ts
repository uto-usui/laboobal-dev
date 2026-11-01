/**
 * el の中でのポインターの位置（el の左上が 0）。動かす前は el の真ん中にしておく。
 * 大きさが変わったときに、まだ動かしていなければ真ん中に置き直す
 */
export const trackPointer = (el: HTMLElement) => {
  const pointer = { x: el.clientWidth / 2, y: el.clientHeight / 2 }
  let moved = false
  el.addEventListener('pointermove', (e) => {
    const rect = el.getBoundingClientRect()
    pointer.x = e.clientX - rect.left
    pointer.y = e.clientY - rect.top
    moved = true
  })
  new ResizeObserver(() => {
    if (moved) return
    pointer.x = el.clientWidth / 2
    pointer.y = el.clientHeight / 2
  }).observe(el)
  return pointer
}
