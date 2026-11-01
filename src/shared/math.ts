/** a から b へ t（0〜1）の割合だけ進んだ値 */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** lerp の逆。value が a〜b のどこにあるかを 0〜1 で返す（範囲の外は 0 未満や 1 超になる） */
export const norm = (a: number, b: number, value: number) =>
  (value - a) / (b - a)

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/** value を from の範囲から to の範囲へ写す。範囲の外は端に丸める */
export const map = (
  value: number,
  fromMin: number,
  fromMax: number,
  toMin: number,
  toMax: number,
) => lerp(toMin, toMax, clamp(norm(fromMin, fromMax, value), 0, 1))

/**
 * 毎フレーム「差の一部だけ近づく」動きを、フレームレートに左右されないようにした lerp。
 * lambda が大きいほど速く追いつく。dt は秒
 */
export const damp = (a: number, b: number, lambda: number, dt: number) =>
  lerp(a, b, 1 - Math.exp(-lambda * dt))

export const distance = (x0: number, y0: number, x1: number, y1: number) =>
  Math.hypot(x1 - x0, y1 - y0)

export const random = (min: number, max: number) =>
  min + Math.random() * (max - min)

export const shuffle = <T>(items: readonly T[]): T[] => {
  const array = [...items]
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}
