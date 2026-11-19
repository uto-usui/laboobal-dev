import { apply, frame, add, sub, mul } from './rod'
import { snowShape, snowVolume } from './snow-shape'
export { snowShape } from './snow-shape'
export const STEP = 1 / 120
export const POINT_STRIDE = 20
export const SNOW_POINTS = 100
export const SNOW_STRIDE = 48
export interface Snow {
  start: number
  anchor: number
  center: number[]
  size: number[]
  slope: number
  supports: [number, number]
  edge: number
  t: number
  band: number
  phase: number
  mass: number
}
export const makeScene = (compact: boolean) => {
  const nodes: number[][] = [],
    paths: number[][] = [],
    segments: number[] = [],
    needles: number[] = [],
    snows: Snow[] = []
  const point = (p: number[], radius: number, group = 0) => {
    nodes.push([
      ...p,
      group === 0 && nodes.length === 0 ? 0 : 1,
      ...p,
      radius,
      ...p,
      group,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
    ])
    return nodes.length - 1
  }
  const path = (
    count: number,
    curve: (t: number) => number[],
    root?: number,
  ) => {
    const ids = root === undefined ? [] : [root]
    for (let i = root === undefined ? 0 : 1; i < count; i++) {
      const t = i / (count - 1),
        radius =
          root === undefined ? 0.09 * (1 - t) + 0.014 : 0.041 * (1 - t) + 0.008
      ids.push(point(curve(t), radius))
    }
    for (let i = 1; i < ids.length; i++) segments.push(ids[i - 1], ids[i], 0, 0)
    paths.push(ids)
    return ids
  }
  const length = compact ? 6.6 : 11.3
  const main = path(12, (t) => [
    -length * 0.52 + length * t,
    -0.65 + 1.18 * t + 0.43 * Math.sin(t * Math.PI),
    0.12 * Math.sin(t * 3),
  ])
  const twig = (at: number, dx: number, dy: number) => {
    const p = nodes[main[at]]
    return path(
      8,
      (t) => [p[0] + dx * t, p[1] + dy * t - 0.32 * t * t, p[2] - 0.25 * t],
      main[at],
    )
  }
  // 無荷重でもほぼ水平に伸ばし、雪を載せた後の重力によるたわみを残す。
  const first = twig(4, compact ? 1.5 : 1.9, 0.12)
  const second = compact ? undefined : twig(7, 2, 0.06)
  const specs = compact
    ? [
        { ids: main, at: 4, size: [1.18, 0.36, 0.52] },
        { ids: first, at: 4, size: [0.9, 0.34, 0.48] },
      ]
    : [
        { ids: main, at: 4, size: [1.48, 0.4, 0.58] },
        { ids: first, at: 4, size: [1.08, 0.36, 0.52] },
        { ids: second!, at: 4, size: [0.98, 0.33, 0.49] },
      ]
  const branchCount = nodes.length
  for (const [band, spec] of specs.entries()) {
    // 四つの境目は接着面だけを共有し、落ちた後の形を一つの帯へ拘束しない。
    for (let part = 0; part < 4; part++) {
      const anchor = spec.ids[spec.at],
        p = nodes[anchor]
      const localX = (-0.75 + part * 0.5) * spec.size[0]
      let edge = 0,
        t = 0,
        best = Infinity
      const target = add(
        p.slice(0, 3),
        mul(
          frame(
            sub(nodes[spec.ids[spec.at + 1]].slice(0, 3), p.slice(0, 3)),
          )[0],
          localX,
        ),
      )
      for (let k = 1; k < spec.ids.length; k++) {
        const a = nodes[spec.ids[k - 1]].slice(0, 3),
          b = nodes[spec.ids[k]].slice(0, 3),
          d = sub(b, a)
        const f = Math.max(
          0,
          Math.min(
            1,
            sub(target, a).reduce((v, x, i) => v + x * d[i], 0) /
              d.reduce((v, x) => v + x * x, 0),
          ),
        )
        const error = Math.hypot(...sub(target, add(a, mul(d, f))))
        if (error < best) {
          best = error
          edge =
            segments.findIndex(
              (v, i) =>
                i % 4 === 0 &&
                v === spec.ids[k - 1] &&
                segments[i + 1] === spec.ids[k],
            ) / 4
          t = f
        }
      }
      const a = nodes[segments[edge * 4]].slice(0, 3),
        b = nodes[segments[edge * 4 + 1]].slice(0, 3)
      const basis = frame(sub(b, a)),
        radius =
          (nodes[segments[edge * 4]][7] + nodes[segments[edge * 4 + 1]][7]) / 2
      const center = add(
        add(a, mul(sub(b, a), t)),
        mul(basis[1], radius + 0.045),
      )
      const size = [spec.size[0] * 0.25, spec.size[1], spec.size[2]]
      const start = nodes.length,
        phase = band * 4 + part
      const snow: Snow = {
        start,
        anchor,
        center,
        size,
        slope: basis[0][1] / basis[0][0],
        supports: [segments[edge * 4], segments[edge * 4 + 1]],
        edge,
        t,
        band,
        phase,
        mass: 0,
      }
      for (let z = 0; z < 5; z++)
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 5; x++) {
            const q = snowShape(x / 2 - 1, y / 1.5 - 1, z / 2 - 1, phase)
            point(
              add(
                center,
                apply(
                  basis,
                  q.map((v, k) => v * size[k]),
                ),
              ),
              0,
              snows.length + 1,
            )
          }
      // 体積積分は形状の規則的な格子で行い、形と荷重の増え方をそろえる。
      snow.mass = 0.17 * size[0] * size[1] * size[2] * snowVolume(phase)
      snows.push(snow)
    }
  }
  let seed = 617
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (const [p, ids] of paths.entries()) {
    // 房どうしの間隔を少し変え、雪の下から小枝の先まで葉をつなぐ。
    const tufts = p === 0 ? [2, 4, 5, 6, 8, 9, 10] : [1, 2, 3, 4, 5, 6]
    for (const [tuft, base] of tufts.entries()) {
      const count = p === 0 ? 28 : 26
      const tilt = (p === 0 ? -0.72 : -0.15) + (random() - 0.5) * 0.2
      const covered = specs.some(
        (spec) => spec.ids === ids && Math.abs(spec.at - base) < 4,
      )
      const length = 0.62 + random() * (covered ? 0.06 : 0.12)
      for (let i = 0; i < count; i++) {
        const at = Math.min(ids.length - 2, base - 1 + Math.floor(random() * 2))
        const spread = (i / (count - 1) - 0.5) * 2.1
        needles.push(
          ids[at],
          ids[at + 1],
          0.78 + random() * 0.36,
          random(),
          length +
            random() * (covered ? 0.2 : 0.42) +
            (covered && i % 7 === 0 ? 0.16 : 0) +
            (tuft === tufts.length - 1 ? 0.08 : 0),
          tilt + spread + (random() - 0.5) * 0.12,
          random(),
          -0.22 + random() * 0.95,
        )
      }
    }
  }
  // 分岐点では主枝の接線を引き継ぎ、どの線分から描いても同じ断面にする。
  const frames: number[][] = []
  for (const ids of paths) {
    ids.forEach((id, i) => {
      frames[id] ??= [
        ids[Math.max(0, i - 1)],
        ids[Math.min(ids.length - 1, i + 1)],
      ]
    })
  }
  // 枝は最大 26 点。四つの隣接点番号を未使用の 32 ビットへ詰める。
  for (let i = 0; i < segments.length; i += 4) {
    const [a, b] = [frames[segments[i]], frames[segments[i + 1]]]
    segments[i + 3] = (a[0] | (a[1] << 8) | (b[0] << 16) | (b[1] << 24)) >>> 0
  }
  return {
    nodes: new Float32Array(nodes.flat()),
    segments: new Uint32Array(segments),
    needles: new Float32Array(needles),
    snows,
    paths,
    count: nodes.length,
    branchCount,
    compact,
  }
}
export type Scene = ReturnType<typeof makeScene>
