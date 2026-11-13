// 保存する座標は基準画面、時刻は書き始めからの ms。太さは表示先の CSS px で求める
export type Point = [number, number, number, number]
export type Center = [number, number, number, number]
export const MAX_POINTS = 2048

const distance = (a: number[], b: number[]) =>
  Math.hypot(b[0] - a[0], b[1] - a[1])
const mix = (a: number[], b: number[], t: number): Point =>
  a.map((v, i) => v + (b[i] - v) * t) as Point

/** 末尾を捨てず、道のりを等分して時刻・筆圧も補間する */
export const resample = (points: Point[], count: number) => {
  if (points.length <= count) return points
  const lengths = [0]
  for (let i = 1; i < points.length; i++)
    lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]))
  const total = lengths.at(-1)!
  if (!total) return [points[0], points.at(-1)!]
  const result = [points[0]]
  let i = 1
  for (let j = 1; j < count - 1; j++) {
    const s = (total * j) / (count - 1)
    while (lengths[i] < s) i++
    result.push(
      mix(
        points[i - 1],
        points[i],
        (s - lengths[i - 1]) / (lengths[i] - lengths[i - 1]),
      ),
    )
  }
  result.push(points.at(-1)!)
  return result
}

export const hasPressure = (p: number) => p > 0 && p <= 1 && p !== 0.5

/** 出力の4列目は筆圧でなく、平滑化後の道のり s */
export const prepare = (raw: Point[], pressure: boolean, scale: number) => {
  let speed = 0
  let points: Point[] = raw.map((p, i) => {
    if (i) {
      const dt = p[2] - raw[i - 1][2]
      // 同時刻の統合イベントは、直前の速さを引き継ぐ
      if (dt > 0) {
        const v = (distance(raw[i - 1], p) * scale) / dt
        speed += (v - speed) * (1 - Math.exp(-dt / 35))
      }
    }
    const width = pressure
      ? 1.5 + 5.5 * Math.sqrt(Math.max(0, Math.min(1, p[3])))
      : 1.5 + 3 / (1 + speed * 1.8)
    return [p[0] * scale, p[1] * scale, width, 0]
  })
  const spaced: Point[] = []
  for (const p of points)
    if (!spaced.length || distance(spaced.at(-1)!, p) >= 1) spaced.push(p)
  const end = points.at(-1)
  if (end && spaced.at(-1) !== end) spaced.push(end)
  points = spaced
  for (let pass = 0; pass < 2 && points.length > 1; pass++) {
    const next = [points[0]]
    for (let i = 1; i < points.length; i++) {
      next.push(mix(points[i - 1], points[i], 0.25))
      next.push(mix(points[i - 1], points[i], 0.75))
    }
    next.push(points.at(-1)!)
    points = resample(next, MAX_POINTS)
  }
  const centers: Center[] = []
  let length = 0
  for (const p of points) {
    const d = centers.length ? distance(centers.at(-1)!, p) : 0
    if (centers.length && d < 0.0001) continue
    length += d
    centers.push([p[0], p[1], p[2], length])
  }
  return { centers, length }
}

export type Stroke = ReturnType<typeof prepare>

export const tipAt = ({ centers, length }: Stroke, p: number): Center => {
  const s = p * length
  for (let i = 1; i < centers.length; i++) {
    const a = centers[i - 1]
    const b = centers[i]
    if (b[3] >= s) return mix(a, b, (s - a[3]) / (b[3] - a[3]))
  }
  return centers.at(-1)!
}
