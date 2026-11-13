import type { Point } from './stroke'

const TAU = Math.PI * 2
const curves = [
  // 内側から外へ進み、最後の輪に余白を残す
  (t: number) => {
    const r = 0.08 + 0.92 * t
    return [r * Math.cos(TAU * 2.5 * t), r * Math.sin(TAU * 2.5 * t)]
  },
  (t: number) => {
    const a = TAU * t
    const r = Math.cos(3 * a)
    return [r * Math.cos(a), r * Math.sin(a)]
  },
  (t: number) => [Math.sin(TAU * 2 * t), Math.sin(TAU * 3 * t)],
  (t: number) => {
    const a = TAU * t
    return [
      0.75 * Math.cos(a) + 0.25 * Math.cos(5 * a),
      0.75 * Math.sin(a) + 0.25 * Math.sin(5 * a),
    ]
  },
  (t: number) => [1.35 * Math.sin(TAU * t), Math.sin(TAU * 2 * t)],
  (t: number) => {
    const a = TAU * t - Math.PI / 2
    const r = 0.78 + 0.22 * Math.cos(5 * TAU * t)
    return [r * Math.cos(a), r * Math.sin(a)]
  },
]

export const nextShape = (previous = -1) => {
  const choices = curves.map((_, i) => i).filter((i) => i !== previous)
  const index = choices[Math.floor(Math.random() * choices.length)]
  // 3 枚の花びらは π で閉じるので、同じ軌跡を二重にたどらない
  const span = index === 1 ? 0.5 : 1
  const raw = Array.from({ length: 721 }, (_, i) =>
    curves[index]((i / 720) * span),
  )
  const xs = raw.map(([x]) => x)
  const ys = raw.map(([, y]) => y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const width = Math.max(...xs) - left
  const height = Math.max(...ys) - top
  const scale = Math.min(480 / width, 300 / height)
  let time = 0
  const points: Point[] = raw.map(([x, y], i) => {
    if (i) {
      const [px, py] = raw[i - 1]
      const speed = 0.8 + 0.25 * Math.sin((i / 720) * TAU * 3)
      time += (Math.hypot(x - px, y - py) * scale) / speed
    }
    return [
      400 + (x - left - width / 2) * scale,
      250 + (y - top - height / 2) * scale,
      time,
      0.5,
    ]
  })
  return { index, points }
}
