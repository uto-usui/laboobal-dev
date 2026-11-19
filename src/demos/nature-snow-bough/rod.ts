export type Vec = number[]
export const add = (a: Vec, b: Vec) => a.map((v, k) => v + b[k])
export const sub = (a: Vec, b: Vec) => a.map((v, k) => v - b[k])
export const mul = (a: Vec, s: number) => a.map((v) => v * s)
export const dot = (a: Vec, b: Vec) => a.reduce((s, v, k) => s + v * b[k], 0)
export const cross = (a: Vec, b: Vec) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export const unit = (a: Vec) => mul(a, 1 / Math.max(1e-12, Math.hypot(...a)))
// 列ベクトルは接線、断面の上、断面の左右。根元の座標系は時間で変えない。
export const identity = () => [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]
export const apply = (r: Vec[], v: Vec) =>
  [0, 1, 2].map((k) => r[0][k] * v[0] + r[1][k] * v[1] + r[2][k] * v[2])
export const transpose = (r: Vec[]) => [0, 1, 2].map((k) => r.map((v) => v[k]))
export const product = (a: Vec[], b: Vec[]) => b.map((v) => apply(a, v))
export const frame = (t: Vec) => {
  const x = unit(t),
    z = unit(cross(x, Math.abs(x[1]) < 0.95 ? [0, 1, 0] : [0, 0, 1]))
  return [x, unit(cross(z, x)), z]
}
export const rotation = (q: Vec) => {
  const angle = Math.hypot(...q)
  const a = angle < 1e-7 ? 1 - (angle * angle) / 6 : Math.sin(angle) / angle
  const b =
    angle < 1e-7
      ? 0.5 - (angle * angle) / 24
      : (1 - Math.cos(angle)) / (angle * angle)
  return identity().map((v) =>
    add(add(v, mul(cross(q, v), a)), mul(cross(q, cross(q, v)), b)),
  )
}
// exp(q) の微分。大きく引いたときも、一般化速度と実際の回転軸を合わせる。
const rotationJacobian = (q: Vec) => {
  const a = Math.hypot(...q)
  const b = a < 1e-5 ? 0.5 - (a * a) / 24 : (1 - Math.cos(a)) / (a * a)
  const c = a < 1e-5 ? 1 / 6 - (a * a) / 120 : (a - Math.sin(a)) / (a * a * a)
  return identity().map((v) =>
    add(add(v, mul(cross(q, v), b)), mul(cross(q, cross(q, v)), c)),
  )
}
export const rigidity = (
  radius: number,
  young = 1.8e7,
  shear = young / 2.6,
) => ({
  bending: (young * Math.PI * radius ** 4) / 4,
  torsion: (shear * Math.PI * radius ** 4) / 2,
})
export interface RodEdge {
  a: number
  b: number
  parent: number
  length: number
  radius: number
  restFrame: Vec[]
  relative: Vec[]
  stiffness: Vec
}
export interface RodLoad {
  edge: number
  t: number
  offset: Vec
  mass: number
  force?: Vec
}
export interface Grip {
  edge: number
  t: number
  target: Vec
}
export class Rod {
  edges: RodEdge[]
  q: Float64Array
  velocity: Float64Array
  positions: Vec[]
  frames: Vec[][] = []
  axes: Vec[][] = []
  chains: number[][] = []
  root: Vec
  nodeMass: number[]
  constructor(rest: Vec[], links: number[][], radii: number[], young = 1.8e7) {
    this.root = rest[0].slice()
    this.positions = rest.map((p) => p.slice())
    this.nodeMass = rest.map(() => 0.006)
    this.edges = links.map(([a, b], i) => {
      const parent = links.findIndex(([, end]) => end === a)
      const length = Math.hypot(...sub(rest[b], rest[a]))
      const restFrame = frame(sub(rest[b], rest[a]))
      const previous =
        parent < 0 ? restFrame : frame(sub(rest[a], rest[links[parent][0]]))
      const dual =
        parent < 0
          ? length / 2
          : (length + Math.hypot(...sub(rest[a], rest[links[parent][0]]))) / 2
      const { bending, torsion } = rigidity(radii[i], young)
      return {
        a,
        b,
        parent,
        length,
        radius: radii[i],
        restFrame,
        relative: product(transpose(previous), restFrame),
        stiffness: [torsion / dual, bending / dual, bending / dual],
      }
    })
    this.q = new Float64Array(this.edges.length * 3)
    this.velocity = this.q.slice()
    this.update()
  }
  update() {
    this.positions[0] = this.root.slice()
    this.edges.forEach((edge, i) => {
      const parent = edge.parent < 0 ? edge.restFrame : this.frames[edge.parent]
      const base = product(parent, edge.relative)
      const q = Array.from(this.q.slice(i * 3, i * 3 + 3))
      this.frames[i] = product(base, rotation(q))
      this.axes[i] = product(base, rotationJacobian(q))
      this.chains[i] = [...(edge.parent < 0 ? [] : this.chains[edge.parent]), i]
      this.positions[edge.b] = add(
        this.positions[edge.a],
        mul(this.frames[i][0], edge.length),
      )
    })
  }
  site(edge: number, t: number, offset = [0, 0, 0]) {
    const e = this.edges[edge]
    return add(
      this.positions[e.a],
      apply(this.frames[edge], add([e.length * t, 0, 0], offset)),
    )
  }
  jacobian(edge: number, position: Vec) {
    const j = new Float64Array(this.q.length * 3)
    for (const ancestor of this.chains[edge]) {
      const lever = sub(position, this.positions[this.edges[ancestor].a])
      for (let axis = 0; axis < 3; axis++)
        j.set(
          cross(this.axes[ancestor][axis], lever),
          (ancestor * 3 + axis) * 3,
        )
    }
    return j
  }
  energy() {
    return this.edges.reduce(
      (sum, e, i) =>
        sum +
        e.stiffness.reduce(
          (s, k, a) => s + 0.5 * k * this.q[i * 3 + a] ** 2,
          0,
        ),
      0,
    )
  }
  step(dt: number, loads: RodLoad[], gravity = [0, -2.8, 0], grip?: Grip) {
    const n = this.q.length
    const matrix = new Float64Array(n * n),
      rhs = new Float64Array(n)
    const samples: { j: Float64Array; mass: number; force: Vec }[] = []
    this.edges.forEach((e, i) =>
      samples.push({
        j: this.jacobian(i, this.positions[e.b]),
        mass: this.nodeMass[e.b],
        force: mul(gravity, this.nodeMass[e.b]),
      }),
    )
    for (const load of loads)
      samples.push({
        j: this.jacobian(load.edge, this.site(load.edge, load.t, load.offset)),
        mass: load.mass,
        force: load.force ?? mul(gravity, load.mass),
      })
    for (const { j, mass, force } of samples) {
      for (let a = 0; a < n; a++) {
        const ia = a * 3
        rhs[a] +=
          dt * (j[ia] * force[0] + j[ia + 1] * force[1] + j[ia + 2] * force[2])
        for (let b = 0; b <= a; b++) {
          const ib = b * 3
          matrix[a * n + b] +=
            mass *
            (j[ia] * j[ib] + j[ia + 1] * j[ib + 1] + j[ia + 2] * j[ib + 2])
        }
      }
    }
    for (let a = 0; a < n; a++) {
      // 小さな断面回転慣性で、接線まわりの自由度にも正の質量を持たせる。
      const inertia = 0.00002
      let momentum = inertia * this.velocity[a]
      for (let b = 0; b < n; b++)
        momentum +=
          matrix[Math.max(a, b) * n + Math.min(a, b)] * this.velocity[b]
      const k = this.edges[Math.floor(a / 3)].stiffness[a % 3]
      rhs[a] += momentum - dt * k * this.q[a]
      matrix[a * n + a] += inertia
    }
    // Rayleigh 減衰と弾性を含む陰的な速度更新。姿勢を時間で固定する処理は置かない。
    for (let a = 0; a < n; a++) {
      for (let b = 0; b <= a; b++) matrix[a * n + b] *= 1 + dt * 2.8
      const k = this.edges[Math.floor(a / 3)].stiffness[a % 3]
      matrix[a * n + a] += dt * dt * k + dt * 0.006 * k
    }
    if (grip) {
      const p = this.site(grip.edge, grip.t),
        j = this.jacobian(grip.edge, p)
      const error = sub(grip.target, p),
        stiffness = 95
      for (let a = 0; a < n; a++) {
        rhs[a] +=
          dt *
          stiffness *
          (j[a * 3] * error[0] +
            j[a * 3 + 1] * error[1] +
            j[a * 3 + 2] * error[2])
        for (let b = 0; b <= a; b++)
          matrix[a * n + b] +=
            dt *
            dt *
            stiffness *
            (j[a * 3] * j[b * 3] +
              j[a * 3 + 1] * j[b * 3 + 1] +
              j[a * 3 + 2] * j[b * 3 + 2])
      }
    }
    // 対称正定値なので Cholesky で解く。接続した枝と雪の慣性を一緒に伝える。
    for (let a = 0; a < n; a++)
      for (let b = 0; b <= a; b++) {
        let v = matrix[a * n + b]
        for (let k = 0; k < b; k++) v -= matrix[a * n + k] * matrix[b * n + k]
        matrix[a * n + b] =
          a === b ? Math.sqrt(Math.max(v, 1e-12)) : v / matrix[b * n + b]
      }
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < a; b++) rhs[a] -= matrix[a * n + b] * rhs[b]
      rhs[a] /= matrix[a * n + a]
    }
    for (let a = n - 1; a >= 0; a--) {
      for (let b = a + 1; b < n; b++) rhs[a] -= matrix[b * n + a] * rhs[b]
      rhs[a] /= matrix[a * n + a]
    }
    for (let a = 0; a < n; a++) {
      this.velocity[a] = rhs[a]
      this.q[a] += dt * rhs[a]
    }
    this.update()
  }
}
