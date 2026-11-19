import {
  contactMargin,
  contactShape,
  dot3,
  pairContacts,
  pairSweepSafe,
  selfContact,
  selfSweepSafe,
  sub,
  witnessPoint,
  type Contact,
  type Shape,
  type Witness,
} from './contact-geometry.ts'
import {
  createLeaves,
  pageSeed,
  leafClearance,
  leafBasis,
  dot,
  integrateLeaf,
  resolveContact,
  type Leaf,
  type Settings,
} from './simulation.ts'

export const pose = (leaf: Leaf) => [...leaf.angle, leaf.bend]
export const setPose = (leaf: Leaf, p: number[]) => {
  leaf.angle = p.slice(0, 3)
  leaf.bend = p[3]
  leaf.clearance = undefined
}
const interpolate = (a: number[], b: number[], t: number) =>
  a.map((v, j) => v + (b[j] - v) * t)
export const motionBound = (leaf: Leaf, a: number[], b: number[]) => {
  const radius = Math.hypot(
    leaf.width,
    leaf.stem + leaf.length,
    Math.abs(leaf.z) + 0.4 + Math.max(Math.abs(a[3]), Math.abs(b[3])),
  )
  // 葉柄の制御点も姿勢に追随する。制御点の補正は1-Lipschitzの平面射影。
  return (
    radius * a.slice(0, 3).reduce((s, v, j) => s + Math.abs(b[j] - v), 0) +
    2 * Math.abs(b[3] - a[3])
  )
}
interface Constraint {
  i: number
  j: number
  hit: Contact
  kind: number
}
const constraints = (shapes: Shape[], limit: number): Constraint[] => {
  const hits: Constraint[] = []
  for (let i = 0; i < shapes.length; i++)
    for (let j = i + 1; j < shapes.length; j++) {
      for (const [kind, hit] of pairContacts(
        shapes[i],
        shapes[j],
        limit,
      ).entries())
        if (hit) hits.push({ i, j, kind, hit })
    }
  for (let i = 0; i < shapes.length; i++) {
    const hit = selfContact(shapes[i], limit)
    if (hit) hits.push({ i, j: i, hit, kind: 1 })
  }
  return hits
}
const gradient = (
  leaf: Leaf,
  witness: Witness,
  normal: number[],
  sign: number,
) => {
  if (witness.local) {
    const basis = leafBasis(leaf, 0),
      p = witness.local,
      z = p[2] + leaf.bend * p[3]
    const r = basis[0].map(
      (v, j) => v * p[0] + basis[1][j] * p[1] + basis[2][j] * z,
    )
    const torque = [
      r[1] * normal[2] - r[2] * normal[1],
      r[2] * normal[0] - r[0] * normal[2],
      r[0] * normal[1] - r[1] * normal[0],
    ]
    const roll = leaf.rest[2] + leaf.angle[2]
    return [
      dot3(basis[0], torque),
      -Math.sin(roll) * torque[0] + Math.cos(roll) * torque[1],
      torque[2],
      dot3(basis[2], normal) * p[3],
    ].map((v) => sign * v)
  }
  const before = pose(leaf),
    p = witnessPoint(leaf, witness),
    g = []
  for (let axis = 0; axis < 4; axis++) {
    const q = [...before]
    q[axis] += 0.0001
    setPose(leaf, q)
    g.push((sign * dot3(sub(witnessPoint(leaf, witness), p), normal)) / 0.0001)
  }
  setPose(leaf, before)
  return g
}
const invMass = (leaf: Leaf, axis: number) =>
  1 / (leaf.inertia * (axis === 3 ? 2 : 1))
const project = (leaves: Leaf[], constraint: Constraint, position: boolean) => {
  const { i, j, hit, kind } = constraint,
    a = leaves[i],
    b = leaves[j]
  const gap =
    dot3(sub(witnessPoint(a, hit.a), witnessPoint(b, hit.b)), hit.normal) -
    hit.radius
  const target = contactMargin(kind) + 0.012
  if (gap > target + 0.001) return 0
  const ga = gradient(a, hit.a, hit.normal, 1),
    gb = gradient(b, hit.b, hit.normal, -1)
  const terms: [Leaf, number[]][] =
    i === j
      ? [[a, ga.map((v, k) => v + gb[k])]]
      : [
          [a, ga],
          [b, gb],
        ]
  const norm = terms.reduce(
    (sum, [leaf, g]) =>
      sum + g.reduce((s, v, k) => s + v * v * invMass(leaf, k), 0),
    0,
  )
  if (norm < 1e-10) return 0
  if (position && gap < target) {
    let impulse = (target - gap) / norm
    // 特異な勾配で一度に跳ねないようにし、残りを反復で解く。
    const maximum = Math.max(
      ...terms.flatMap(([leaf, g]) =>
        g.map((v, k) => Math.abs(v * invMass(leaf, k))),
      ),
    )
    impulse = Math.min(impulse, 0.025 / maximum)
    for (const [leaf, g] of terms)
      setPose(
        leaf,
        pose(leaf).map((v, k) => v + impulse * g[k] * invMass(leaf, k)),
      )
  }
  const av = [...a.velocity, a.bendVelocity],
    bv = [...b.velocity, b.bendVelocity]
  const speed = ga.reduce((s, v, k) => s + v * av[k] + gb[k] * bv[k], 0)
  if (speed < 0) {
    for (const [leaf, g] of terms) {
      const v = [...leaf.velocity, leaf.bendVelocity].map(
        (v, k) => v - (speed * g[k] * invMass(leaf, k)) / norm,
      )
      leaf.velocity = v.slice(0, 3)
      leaf.bendVelocity = v[3]
    }
  }
  return Math.max(0, target - gap)
}

// 全葉の共通時刻で掃引する。距離の下限で証明できない区間だけ細分化し、
// 上限まで降りても安全を証明できない場合はその区間の手前へ止める。
const sweep = (leaves: Leaf[], before: number[][], after: number[][]) => {
  const moving = before.map((p, i) =>
    p.some((v, j) => Math.abs(v - after[i][j]) > 1e-14),
  )
  const cache = new Map<number, Shape[]>()
  const sample = (t: number) => {
    const cached = cache.get(t)
    if (cached) return cached
    leaves.forEach((leaf, i) =>
      setPose(leaf, interpolate(before[i], after[i], t)),
    )
    const shapes = leaves.map((leaf) => contactShape(leaf))
    cache.set(t, shapes)
    return shapes
  }
  const errors = (a: number, b: number) =>
    leaves.map((leaf, i) => {
      const p = interpolate(before[i], after[i], a),
        q = interpolate(before[i], after[i], b)
      const theta = p.slice(0, 3).reduce((s, v, j) => s + Math.abs(q[j] - v), 0)
      const radius = Math.hypot(
        leaf.width,
        leaf.stem + leaf.length,
        Math.abs(leaf.z) + 0.4 + Math.max(Math.abs(p[3]), Math.abs(q[3])),
      )
      const surface =
        (radius * theta * theta) / 8 + (Math.abs(q[3] - p[3]) * theta) / 4
      const raw = (pose: number[]) => {
        setPose(leaf, pose)
        const basis = leafBasis(leaf, 0),
          side = Math.cos(leaf.rest[2]) < 0 ? 1 : -1
        return (
          dot(
            basis[1].map(
              (v, j) =>
                (-v * leaf.stem + basis[2][j] * leaf.z) * 0.72 +
                basis[0][j] * leaf.stem * 0.13 * side,
            ),
            leaf.contact.slice(0, 3),
          ) - 0.08
        )
      }
      const x = raw(p),
        y = raw(q)
      const kink = x * y < 0 ? Math.abs(x - y) / 4 : 0
      const selfError =
        ((2 * Math.hypot(leaf.stem, leaf.z) + 0.3) * theta * theta) / 2 +
        2 * kink
      return [surface, 2 * surface + kink, selfError]
    })
  const visit = (a: number, b: number, depth: number): number => {
    const shapes = sample(a),
      end = sample(b),
      error = errors(a, b)
    let safe = shapes.every(
      (shape, i) => !moving[i] || selfSweepSafe(shape, end[i], error[i]),
    )
    for (let i = 0; i < leaves.length && safe; i++)
      for (let j = i + 1; j < leaves.length && safe; j++)
        safe =
          (!moving[i] && !moving[j]) ||
          pairSweepSafe(shapes[i], end[i], shapes[j], end[j], [
            error[i],
            error[j],
          ])
    if (safe) return b
    if (depth === 0) return a
    const mid = (a + b) / 2,
      left = visit(a, mid, depth - 1)
    return left < mid ? left : visit(mid, b, depth - 1)
  }
  const fraction = visit(0, 1, 2)
  leaves.forEach((leaf, i) =>
    setPose(leaf, interpolate(before[i], after[i], fraction)),
  )
  return fraction
}

export interface StepStats {
  substeps: number
  iterations: number
  clipped: number
  contacts: number
}
export const stepLeaves = (
  leaves: Leaf[],
  winds: number[],
  dt: number,
  settings: Settings,
  onStep?: (before: number[][]) => void,
): StepStats => {
  const stats = { substeps: 0, iterations: 0, clipped: 0, contacts: 0 }
  // 呼び出し順を変えても同じ組順で解く。風は元の葉に対応させておく。
  const ordered = leaves
    .map((leaf, i) => ({ leaf, wind: winds[i] }))
    .sort((a, b) => a.leaf.x - b.leaf.x)
  const bodies = ordered.map((p) => p.leaf),
    forces = ordered.map((p) => p.wind)
  const before = bodies.map(pose)
  for (let i = 0; i < bodies.length; i++) {
    integrateLeaf(bodies[i], forces[i], dt, settings)
    resolveContact(bodies[i], before[i])
  }
  // 次の掃引に余白を残し、接線方向の動きまで止まり続けることを避ける。
  for (let iteration = 0; iteration < 2; iteration++) {
    let error = 0
    for (const c of constraints(
      bodies.map((leaf) => contactShape(leaf)),
      0.025,
    ))
      error = Math.max(error, project(bodies, c, true))
    if (error < 0.00005) break
    stats.iterations++
    for (let i = 0; i < bodies.length; i++) resolveContact(bodies[i], before[i])
  }
  const proposed = bodies.map(pose)
  const fraction = sweep(bodies, before, proposed)
  if (fraction < 1) {
    stats.clipped++
    // 一組の接触で離れた葉まで停止させない。各移動も連続判定してから採用する。
    // 固定した順で一枚ずつ動かし、既に採用した葉との間も掃引する。
    for (let i = 0; i < bodies.length; i++) {
      const start = bodies.map(pose),
        target = start.map((p) => [...p])
      target[i] = proposed[i]
      sweep(bodies, start, target)
    }
    // 掃引で止まったときだけ詳しい距離を求め、接近速度を取り除く。
    // 接触のない一歩で、同じ三角形を何度も検索しない。
    for (const c of constraints(
      bodies.map((leaf) => contactShape(leaf)),
      0.025,
    )) {
      project(bodies, c, false)
      stats.contacts++
    }
    stats.iterations++
  }
  stats.substeps++
  onStep?.(leaves.map((leaf) => before[bodies.indexOf(leaf)]))
  return stats
}

// 表示前だけ距離拘束を解く。まず振れ幅を保った別候補を試し、最後に縮める。
// 積分や掃引は安全な初期姿勢を前提とするため、ここでは直接姿勢を補正する。
const initialLeaves = new Map<boolean, Leaf[]>()
export const createSettledLeaves = (
  narrow: boolean,
  seed = pageSeed,
): Leaf[] => {
  const cached = seed === pageSeed ? initialLeaves.get(narrow) : undefined
  if (cached) return structuredClone(cached)
  for (let attempt = 0; attempt < 25; attempt++) {
    const leaves = createLeaves(
      narrow,
      (seed + Math.imul(attempt, 2654435761)) >>> 0,
      attempt < 16 ? 1 : 0.85 ** (attempt - 15),
    )
    for (let iteration = 0; iteration < 40; iteration++) {
      for (const c of constraints(
        leaves.map((leaf) => contactShape(leaf)),
        0.04,
      ))
        project(leaves, c, true)
      for (const leaf of leaves) {
        const gap = leafClearance(leaf)
        if (gap >= 0.017) continue
        const before = pose(leaf)
        const g = before.map((_, axis) => {
          const p = [...before]
          p[axis] += 0.0001
          setPose(leaf, p)
          return (leafClearance(leaf) - gap) / 0.0001
        })
        const norm = Math.max(dot(g, g), 1e-10)
        setPose(
          leaf,
          before.map(
            (v, axis) =>
              v +
              Math.max(
                -0.025,
                Math.min(0.025, (g[axis] * (0.017 - gap)) / norm),
              ),
          ),
        )
      }
      if (
        leaves.every((leaf) => leafClearance(leaf) >= 0.015) &&
        constraints(
          leaves.map((leaf) => contactShape(leaf)),
          0.04,
        ).every((c) => c.hit.gap >= contactMargin(c.kind) + 0.0001)
      ) {
        if (seed === pageSeed)
          initialLeaves.set(narrow, structuredClone(leaves))
        return leaves
      }
    }
  }
  throw new Error('安全な葉の初期配置を作れませんでした')
}
