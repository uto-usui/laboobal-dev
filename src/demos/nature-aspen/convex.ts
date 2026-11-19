import type { Contact, Witness } from './contact-geometry'

type Vec = number[]
export interface Hull {
  key: object
  transform?: { basis: Vec[]; pivot: Vec; bend: number }
  parts?: Hull[]
  points: { world: Vec; witness: Witness }[]
  radius: number
}
interface Point {
  p: Vec
  a: Witness
  b: Witness
}
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sub = (a: Vec, b: Vec) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const blend = (points: Point[], weights: number[]) =>
  [0, 1, 2].map((j) => points.reduce((s, p, i) => s + p.p[j] * weights[i], 0))
const support = (
  h: Hull,
  axis: Vec,
  minimum: boolean,
): { world: Vec; witness: Witness } => {
  if (h.parts) {
    const a = support(h.parts[0], axis, minimum),
      b = support(h.parts[1], axis, minimum)
    return (
      minimum
        ? dot(a.world, axis) < dot(b.world, axis)
        : dot(a.world, axis) > dot(b.world, axis)
    )
      ? a
      : b
  }
  if (h.transform) {
    const { basis, pivot, bend } = h.transform,
      x = dot(basis[0], axis),
      y = dot(basis[1], axis),
      z = dot(basis[2], axis)
    let best = h.points[0],
      value = Infinity * (minimum ? 1 : -1)
    for (const point of h.points) {
      const p = point.witness.local!,
        v = p[0] * x + p[1] * y + (p[2] + bend * p[3]) * z
      if (minimum ? v < value : v > value) {
        value = v
        best = point
      }
    }
    const p = best.witness.local!,
      depth = p[2] + bend * p[3]
    return {
      world: [0, 1, 2].map(
        (j) =>
          pivot[j] +
          basis[0][j] * p[0] +
          basis[1][j] * p[1] +
          basis[2][j] * depth,
      ),
      witness: best.witness,
    }
  }
  let best = h.points[0],
    value = dot(best.world, axis)
  for (let i = 1; i < h.points.length; i++) {
    const point = h.points[i],
      v = dot(point.world, axis)
    if (minimum ? v < value : v > value) {
      value = v
      best = point
    }
  }
  return best
}

// 単体の全ての辺と面から原点への最近点を選ぶ。四面体の内部も検査する。
const closest = (
  points: Point[],
): { points: Point[]; weights: number[]; p: Vec } => {
  let best = { points: [points[0]], weights: [1], p: points[0].p },
    distance = dot(best.p, best.p)
  const take = (indices: number[], weights: number[]) => {
    if (weights.some((w) => w < -1e-10)) return
    const chosen = indices.map((i) => points[i]),
      p = blend(chosen, weights),
      d = dot(p, p)
    if (d < distance) {
      distance = d
      best = { points: chosen, weights, p }
    }
  }
  for (let i = 0; i < points.length; i++) take([i], [1])
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i].p,
        e = sub(points[j].p, a),
        t = Math.max(0, Math.min(1, -dot(a, e) / Math.max(1e-30, dot(e, e))))
      take([i, j], [1 - t, t])
    }
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++)
      for (let k = j + 1; k < points.length; k++) {
        const a = points[i].p,
          u = sub(points[j].p, a),
          v = sub(points[k].p, a),
          uu = dot(u, u),
          vv = dot(v, v),
          uv = dot(u, v),
          d = uu * vv - uv * uv
        if (d < 1e-25) continue
        const x = (dot(a, v) * uv - dot(a, u) * vv) / d,
          y = (dot(a, u) * uv - dot(a, v) * uu) / d
        take([i, j, k], [1 - x - y, x, y])
      }
  if (points.length === 4) {
    const a = points[0].p,
      u = sub(points[1].p, a),
      v = sub(points[2].p, a),
      w = sub(points[3].p, a)
    const det = (x: Vec, y: Vec, z: Vec) =>
      x[0] * (y[1] * z[2] - y[2] * z[1]) -
      x[1] * (y[0] * z[2] - y[2] * z[0]) +
      x[2] * (y[0] * z[1] - y[1] * z[0])
    const d = det(u, v, w)
    if (Math.abs(d) > 1e-25) {
      const q = a.map((x) => -x),
        x = det(q, v, w) / d,
        y = det(u, q, w) / d,
        z = det(u, v, q) / d
      if (Math.min(x, y, z, 1 - x - y - z) >= -1e-10)
        return { points, weights: [1 - x - y - z, x, y, z], p: [0, 0, 0] }
    }
  }
  const kept = best.weights
    .map((w, i) => ({ w, p: best.points[i] }))
    .filter((x) => x.w > 1e-10)
  return {
    points: kept.map((x) => x.p),
    weights: kept.map((x) => x.w),
    p: best.p,
  }
}
const witness = (
  points: Point[],
  weights: number[],
  side: 'a' | 'b',
): Witness => {
  const key = points[0][side].local ? 'local' : 'stem'
  return {
    [key]: [0, 1, 2, 3].map((j) =>
      points.reduce((s, p, i) => s + p[side][key]![j] * weights[i], 0),
    ),
  }
}
const axes = new WeakMap<object, WeakMap<object, Vec>>()
const solve = (a: Hull, b: Hull, limit: number) => {
  let cache = axes.get(a.key)
  if (!cache) {
    cache = new WeakMap()
    axes.set(a.key, cache)
  }
  let axis = cache.get(b.key) ?? sub(a.points[0].world, b.points[0].world),
    simplex: Point[] = [],
    nearest: ReturnType<typeof closest> | undefined
  const radius = a.radius + b.radius
  for (let iteration = 0; iteration < 12; iteration++) {
    if (dot(axis, axis) < 1e-24) axis = [0, 0, 1]
    const av = support(a, axis, true),
      bv = support(b, axis, false),
      p = sub(av.world, bv.world)
    const length = Math.sqrt(dot(axis, axis))
    // この射影下限だけで安全を証明する。反復の打ち切りを安全扱いにしない。
    if (dot(p, axis) / length >= limit + radius) {
      cache.set(b.key, axis)
      return { safe: true }
    }
    if (simplex.some((v) => dot(sub(v.p, p), sub(v.p, p)) < 1e-24)) break
    simplex.push({ p, a: av.witness, b: bv.witness })
    nearest = closest(simplex)
    simplex = nearest.points
    axis = nearest.p
    if (dot(axis, axis) < 1e-20) break
  }
  cache.set(b.key, axis)
  if (!nearest) return { safe: false }
  const length = Math.sqrt(dot(nearest.p, nearest.p))
  const contact: Contact = {
    a: witness(nearest.points, nearest.weights, 'a'),
    b: witness(nearest.points, nearest.weights, 'b'),
    normal: length > 1e-10 ? nearest.p.map((x) => x / length) : [0, 0, 1],
    gap: length - radius,
    radius,
  }
  return { safe: false, contact }
}
export const hullContact = (a: Hull, b: Hull, limit: number) =>
  solve(a, b, limit).contact
export const hullSweepSafe = (
  a: Hull,
  a1: Hull,
  b: Hull,
  b1: Hull,
  margin: number,
) =>
  solve(
    {
      key: a.key,
      points: a.points,
      parts: [a, a1],
      radius: Math.max(a.radius, a1.radius),
    },
    {
      key: b.key,
      points: b.points,
      parts: [b, b1],
      radius: Math.max(b.radius, b1.radius),
    },
    margin,
  ).safe
