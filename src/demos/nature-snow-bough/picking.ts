import { type Bounds, pointAt, projectToScreen } from './projection'
import { SNOW_POINTS, SNOW_STRIDE, type Scene } from './scene'

export const PICK_RADIUS = 24
const cross = (o: number[], a: number[], b: number[]) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

// 雪の投影の凸包を使い、空の四角い領域まで「つかめる」にしない。
const inside = (p: number[], points: number[][]) => {
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const half = (list: number[][]) => {
    const hull: number[][] = []
    for (const point of list) {
      while (
        hull.length > 1 &&
        cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0
      )
        hull.pop()
      hull.push(point)
    }
    return hull.slice(0, -1)
  }
  const hull = [...half(points), ...half(points.slice().reverse())]
  return (
    hull.length > 2 &&
    hull.every((a, i) => cross(a, hull[(i + 1) % hull.length], p) >= 0)
  )
}

export const pickBranchSite = (
  scene: Scene,
  nodes: Float32Array,
  snow: Float32Array,
  position: number[],
  view: number[],
  bounds: Bounds,
  interpolation = 1,
) => {
  for (const [i, patch] of scene.snows.entries()) {
    if (snow[i * SNOW_STRIDE + 8] < 0.5 || snow[i * SNOW_STRIDE + 10] > 0.5)
      continue
    const outline = Array.from({ length: SNOW_POINTS }, (_, n) => {
      const p = pointAt(nodes, patch.start + n, interpolation)
      return projectToScreen(p, view, bounds)
    })
    if (inside(position, outline)) {
      return { edge: patch.edge, t: patch.t, node: patch.anchor }
    }
  }
  let best = PICK_RADIUS + 1e-6
  let picked: { edge: number; t: number; node: number } | undefined
  for (let i = 0; i < scene.segments.length; i += 4) {
    const aId = scene.segments[i],
      bId = scene.segments[i + 1]
    const neighbors = scene.segments[i + 3]
    const a = pointAt(nodes, aId, interpolation),
      b = pointAt(nodes, bId, interpolation)
    const tangent = (before: number, after: number) => {
      const p = pointAt(nodes, before, interpolation),
        q = pointAt(nodes, after, interpolation)
      const length = Math.max(1e-9, Math.hypot(...q.map((v, k) => v - p[k])))
      return q.map((v, k) => (v - p[k]) / length)
    }
    const ta =
      aId === 0
        ? [0, 1, 2].map(
            (k) => nodes[bId * 20 + 8 + k] - nodes[aId * 20 + 8 + k],
          )
        : tangent(neighbors & 255, (neighbors >>> 8) & 255)
    if (aId === 0) {
      const length = Math.hypot(...ta)
      ta.forEach((v, k) => {
        ta[k] = v / length
      })
    }
    const tb = tangent((neighbors >>> 16) & 255, neighbors >>> 24)
    const span = Math.hypot(...b.map((v, k) => v - a[k]))
    // 描画と同じ Hermite 曲線をたどり、節点の間や曲がった小枝も拾う。
    let previous = projectToScreen(a, view, bounds)
    for (let step = 1; step <= 4; step++) {
      const t = step / 4
      const p = projectToScreen(
        a.map(
          (v, k) =>
            (2 * t ** 3 - 3 * t ** 2 + 1) * v +
            (t ** 3 - 2 * t ** 2 + t) * span * ta[k] +
            (-2 * t ** 3 + 3 * t ** 2) * b[k] +
            (t ** 3 - t ** 2) * span * tb[k],
        ),
        view,
        bounds,
      )
      const dx = p[0] - previous[0],
        dy = p[1] - previous[1]
      const fraction = Math.max(
        0,
        Math.min(
          1,
          ((position[0] - previous[0]) * dx +
            (position[1] - previous[1]) * dy) /
            Math.max(dx * dx + dy * dy, 1e-9),
        ),
      )
      const distance = Math.hypot(
        position[0] - previous[0] - fraction * dx,
        position[1] - previous[1] - fraction * dy,
      )
      if (distance < best) {
        const id = (step - 1 + fraction) / 4 < 0.5 ? aId : bId
        best = distance
        picked = { edge: i / 4, t: (step - 1 + fraction) / 4, node: id }
      }
      previous = p
    }
  }
  return picked
}

export const pickBranch = (...args: Parameters<typeof pickBranchSite>) =>
  pickBranchSite(...args)?.node ?? -1
