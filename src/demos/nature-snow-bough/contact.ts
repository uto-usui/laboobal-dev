import { add, cross, dot, mul, sub, unit, type Rod, type Vec } from './rod'
import type { Scene } from './scene'

export interface Collider {
  a: Vec
  b: Vec
  radius: number
  edge: number
  needle: boolean
}
// 松葉の根元・向き・たわみは描画と同じ式。細い葉を二つの capsule に分ける。
export const colliders = (
  scene: Scene,
  rod: Rod,
  positions: Vec[],
  frames: Vec[][],
): Collider[] => {
  const result = rod.edges.map((e, edge) => ({
    a: positions[e.a],
    b: positions[e.b],
    radius: e.radius + 0.012,
    edge,
    needle: false,
  }))
  for (let at = 0; at < scene.needles.length; at += 8) {
    const n = scene.needles,
      a = n[at],
      b = n[at + 1]
    const edge = rod.edges.findIndex((e) => e.a === a && e.b === b)
    const parent = rod.edges.findIndex((e) => e.b === a)
    const tangent = unit(sub(positions[b], positions[a]))
    const side = frames[Math.max(parent, 0)][1]
    const direction = unit(
      add(
        add(mul(tangent, Math.cos(n[at + 5])), mul(side, Math.sin(n[at + 5]))),
        mul(unit(cross(tangent, side)), n[at + 7]),
      ),
    )
    const root = add(
      positions[a],
      mul(sub(positions[b], positions[a]), n[at + 6]),
    )
    const bend = [0, -0.055 - n[at + 3] * 0.06, 0.035]
    let previous = root
    for (let part = 1; part <= 2; part++) {
      const t = part / 2
      const point = add(
        add(root, mul(direction, n[at + 4] * t)),
        mul(bend, t * t),
      )
      result.push({ a: previous, b: point, radius: 0.006, edge, needle: true })
      previous = point
    }
  }
  return result
}

// 棒の陰的な速度更新と同じ質量・減衰・弾性から接触点の逆有効質量を求める。
// 軽い小枝を無限質量の壁にすると、次の刻みへ返す反力でエネルギーが増えてしまう。
export class ContactResponse {
  rod: Rod
  factor: Float64Array
  delta: Float64Array
  constructor(
    rod: Rod,
    loads: { edge: number; t: number; offset: Vec; mass: number }[],
    dt: number,
    grip?: { edge: number; t: number },
  ) {
    this.rod = rod
    const n = rod.q.length,
      matrix = new Float64Array(n * n)
    const samples = [
      ...rod.edges.map((e, edge) => ({
        j: rod.jacobian(edge, rod.positions[e.b]),
        mass: rod.nodeMass[e.b],
      })),
      ...loads.map((load) => ({
        j: rod.jacobian(load.edge, rod.site(load.edge, load.t, load.offset)),
        mass: load.mass,
      })),
    ]
    for (const { j, mass } of samples)
      for (let a = 0; a < n; a++)
        for (let b = 0; b <= a; b++)
          matrix[a * n + b] +=
            mass *
            (j[a * 3] * j[b * 3] +
              j[a * 3 + 1] * j[b * 3 + 1] +
              j[a * 3 + 2] * j[b * 3 + 2])
    const gripJ = grip
      ? rod.jacobian(grip.edge, rod.site(grip.edge, grip.t))
      : undefined
    for (let a = 0; a < n; a++) {
      matrix[a * n + a] += 0.00002
      for (let b = 0; b <= a; b++) {
        matrix[a * n + b] *= 1 + dt * 2.8
        if (gripJ)
          matrix[a * n + b] +=
            dt *
            dt *
            95 *
            (gripJ[a * 3] * gripJ[b * 3] +
              gripJ[a * 3 + 1] * gripJ[b * 3 + 1] +
              gripJ[a * 3 + 2] * gripJ[b * 3 + 2])
      }
      const k = rod.edges[Math.floor(a / 3)].stiffness[a % 3]
      matrix[a * n + a] += (dt * dt + dt * 0.006) * k
    }
    for (let a = 0; a < n; a++)
      for (let b = 0; b <= a; b++) {
        let v = matrix[a * n + b]
        for (let k = 0; k < b; k++) v -= matrix[a * n + k] * matrix[b * n + k]
        matrix[a * n + b] =
          a === b ? Math.sqrt(Math.max(v, 1e-12)) : v / matrix[b * n + b]
      }
    this.factor = matrix
    this.delta = new Float64Array(n)
  }
  at(edge: number, point: Vec, direction: Vec) {
    const n = this.delta.length,
      j = this.rod.jacobian(edge, point)
    const rhs = new Float64Array(n)
    for (let a = 0; a < n; a++)
      rhs[a] = dot(Array.from(j.slice(a * 3, a * 3 + 3)), direction)
    const gradient = rhs.slice(),
      matrix = this.factor
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < a; b++) rhs[a] -= matrix[a * n + b] * rhs[b]
      rhs[a] /= matrix[a * n + a]
    }
    for (let a = n - 1; a >= 0; a--) {
      for (let b = a + 1; b < n; b++) rhs[a] -= matrix[b * n + a] * rhs[b]
      rhs[a] /= matrix[a * n + a]
    }
    return {
      inverseMass: gradient.reduce((sum, v, a) => sum + v * rhs[a], 0),
      response: rhs,
    }
  }
  velocity(edge: number, point: Vec) {
    const j = this.rod.jacobian(edge, point),
      result = [0, 0, 0]
    this.delta.forEach((v, a) => {
      for (let k = 0; k < 3; k++) result[k] += j[a * 3 + k] * v
    })
    return result
  }
  impulse(response: Float64Array, impulse: number) {
    this.delta.forEach((v, a) => {
      this.delta[a] = v - response[a] * impulse
    })
  }
}

// 線分と箱の最短距離を、箱の各面を横切る区間ごとに二次式で最小化する。
// 線分の中心に一番近い点だけでは、斜めになった雪の端を通る枝を見落とす。
export const capsuleContact = (
  a: Vec,
  b: Vec,
  basis: Vec[],
  center: Vec,
  half: Vec,
  radius: number,
) => {
  const localA = basis.map((axis) => dot(axis, sub(a, center)))
  const localB = basis.map((axis) => dot(axis, sub(b, center)))
  const d = sub(localB, localA),
    cuts = [0, 1]
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-12) continue
    for (const side of [-1, 1]) {
      const t = (side * half[k] - localA[k]) / d[k]
      if (t > 0 && t < 1) cuts.push(t)
    }
  }
  cuts.sort((x, y) => x - y)
  let best = Infinity,
    fraction = 0
  for (let i = 1; i < cuts.length; i++) {
    const mid = (cuts[i - 1] + cuts[i]) / 2
    let linear = 0,
      square = 0
    for (let k = 0; k < 3; k++) {
      const v = localA[k] + d[k] * mid
      if (Math.abs(v) <= half[k]) continue
      linear += d[k] * (localA[k] - Math.sign(v) * half[k])
      square += d[k] * d[k]
    }
    const t =
      square > 1e-12
        ? Math.max(cuts[i - 1], Math.min(cuts[i], -linear / square))
        : mid
    const distance = localA.reduce(
      (sum, v, k) => sum + Math.max(0, Math.abs(v + d[k] * t) - half[k]) ** 2,
      0,
    )
    if (distance < best) {
      best = distance
      fraction = t
    }
  }
  const distance = Math.sqrt(best)
  if (distance >= radius) return
  const point = add(a, mul(sub(b, a), fraction))
  let normal: Vec,
    depth = radius - distance
  if (distance > 1e-9) {
    const local = add(localA, mul(d, fraction))
    normal = local.map(
      (v, k) => (Math.max(-half[k], Math.min(half[k], v)) - v) / distance,
    )
  } else {
    // 線分の端も含めて箱から出す最小の移動。箱の中の一点だけを押し出さない。
    const overlaps = localA.flatMap((v, k) => [
      half[k] + radius + Math.max(v, localB[k]),
      half[k] + radius - Math.min(v, localB[k]),
    ])
    const index = overlaps.indexOf(Math.min(...overlaps))
    normal = [0, 0, 0]
    normal[Math.floor(index / 2)] = index % 2 === 0 ? 1 : -1
    depth = overlaps[index]
  }
  return {
    point,
    fraction,
    normal: basis[0].map((_, k) =>
      basis.reduce((sum, axis, j) => sum + axis[k] * normal[j], 0),
    ),
    depth,
  }
}
