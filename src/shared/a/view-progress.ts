/**
 * 要素が画面のどこまで来たかを返す。要素の上端が画面の下端から offset px 入ったところで 0、要素の下端が画面の上端を出たところで 1。
 * 範囲の外では 0 未満や 1 超になる。
 * transform で動かす要素を渡すと、動かした位置で測ってしまい、動きが自分に返ってくる。動かさない親を渡す
 */
export const viewProgress = (el: Element, offset = 0) => {
  const { top, height } = el.getBoundingClientRect()
  const viewHeight = window.innerHeight
  return (viewHeight - offset - top) / (viewHeight - offset + height)
}
