// GSAP の tween の then は PromiseLike の形と少し違うので、then を持つものなら受け取れるようにする
type Thenable = { then: (onFulfilled: () => unknown) => unknown }

/**
 * ホバーのアニメーションを、途中で止めずに最後まで動かす。
 * 動いている間にマウスが出入りしたら、今の動きが終わってから、そのときの状態に合わせて次を動かす。
 * over と out は、動き終わったら解決する Promise（GSAP の tween もそのまま渡せる）を返す
 */
export const hoverControl = (
  el: HTMLElement,
  over: () => Thenable,
  out: () => Thenable,
) => {
  let isOver = false
  let playing = false

  const playOver = async () => {
    playing = true
    await over()
    playing = false
    if (!isOver) playOut()
  }
  const playOut = async () => {
    playing = true
    await out()
    playing = false
    if (isOver) playOver()
  }

  // mouseover と mouseout は子要素に出入りしたときにも起きるので、enter と leave を使う
  el.addEventListener('pointerenter', () => {
    isOver = true
    if (!playing) playOver()
  })
  el.addEventListener('pointerleave', () => {
    isOver = false
    if (!playing) playOut()
  })
}
