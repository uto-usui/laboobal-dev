/**
 * シミュレーションを固定の刻みで進める。画面の更新が 60Hz でも 120Hz でも、1 秒に進む歩数を同じにするため。
 * 追いつけないほど遅れたら、上限の歩数で打ち切って遅れを捨てる（重い端末で、追いつこうとしてさらに遅れるのを防ぐ）
 */
export const fixedStepper = (step = 1 / 60, maxSteps = 3) => {
  let carry = 0
  return {
    step,
    /** このフレームで進める歩数 */
    advance(dt: number) {
      carry += dt
      const n = Math.min(Math.floor(carry / step), maxSteps)
      carry = n === maxSteps ? 0 : carry - n * step
      return n
    },
    reset() {
      carry = 0
    },
  }
}
