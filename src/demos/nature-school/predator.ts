export type Vec = [number, number, number]
export type Mode = 'auto' | 'manual'
type Prey = { pos: Vec; vel: Vec }
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const length = (a: Vec) => Math.sqrt(dot(a, a))
const unit = (a: Vec): Vec => mul(a, 1 / Math.max(length(a), 1e-8))
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v))

// 抜けた先で減速する余地を残し、長く画面外へ泳ぎ続けないようにする。
const exitWithinView = (v: Vec, scale: number): Vec => [
  clamp(v[0], -25 * scale, 25 * scale),
  clamp(v[1], -10 * scale, 10 * scale),
  clamp(v[2], -22 * scale, 22 * scale),
]

// 捕食魚の操舵だけを CPU で行う。イワシの近傍計算や反射には介入しない。
export class Hunter {
  pos: Vec = [-20, 5, -3]
  vel: Vec = [4, 0, 1]
  dir: Vec = unit(this.vel)
  bend = 0
  phase = 0
  state: 'approach' | 'burst' | 'coast' | 'return' = 'approach'
  private age = 0
  private prey: Prey = { pos: [-9, 3, 0], vel: [0, 0, 2] }
  private samples: Prey[] = []
  private exit: Vec = [15, 3, 0]
  private orbit: Vec = [0, 0, 0]
  private wander = 0
  private pickAt = 0

  observe(data: Float32Array, count: number) {
    // 観察のたびに 256 組の配列を作らず、同じ領域へ上書きする。
    for (let j = 0; j < 256; j++) {
      const i = Math.floor((j * count) / 256) * 12
      const sample = (this.samples[j] ??= { pos: [0, 0, 0], vel: [0, 0, 0] })
      for (let k = 0; k < 3; k++) {
        sample.pos[k] = data[i + k]
        sample.vel[k] = data[i + 4 + k]
      }
    }
  }

  private pick(scale: number) {
    if (!this.samples.length) return
    const center: Vec = [0, 0, 0]
    for (const p of this.samples)
      for (let k = 0; k < 3; k++) center[k] += p.pos[k] / this.samples.length
    let best = -Infinity
    let chosen: Prey | undefined
    const radius2 = (4.5 * scale) ** 2
    // 候補の評価は距離の二乗だけで行い、近所の配列を候補ごとに作らない。
    for (const p of this.samples) {
      let neighbors = 0
      for (const q of this.samples) {
        const dx = q.pos[0] - p.pos[0]
        const dy = q.pos[1] - p.pos[1]
        const dz = q.pos[2] - p.pos[2]
        if (dx * dx + dy * dy + dz * dz < radius2) neighbors++
      }
      const radial = sub(p.pos, center)
      const edge = length([
        radial[0] / (20 * scale),
        radial[1] / (13 * scale),
        radial[2] / (16 * scale),
      ])
      if (neighbors < 3 || edge < 0.55) continue
      const toward = sub(p.pos, this.pos)
      const score =
        edge * 5 -
        neighbors * 0.08 -
        length(toward) * 0.06 +
        dot(unit(toward), this.dir)
      if (score <= best) continue
      best = score
      chosen = p
    }
    if (!chosen) return
    const pos: Vec = [0, 0, 0]
    const vel: Vec = [0, 0, 0]
    let count = 0
    for (const p of this.samples) {
      const d = sub(p.pos, chosen.pos)
      if (dot(d, d) >= radius2) continue
      count++
      for (let k = 0; k < 3; k++) {
        pos[k] += p.pos[k]
        vel[k] += p.vel[k]
      }
    }
    this.prey = { pos: mul(pos, 1 / count), vel: mul(vel, 1 / count) }
  }

  step(dt: number, mode: Mode, cursor: Vec | undefined, scale: number) {
    if (dt <= 0) return
    this.age += dt
    this.pickAt -= dt
    let target: Vec
    let speed = 5
    let arrival = 0
    if (mode === 'manual') {
      target = cursor ?? this.pos
      speed = 17
      arrival = 7
      // 自動へ戻すときは、その位置と速度から接近し直す。
      this.state = 'approach'
      this.age = 0
      this.pickAt = 0
    } else {
      if (this.state === 'approach' && this.pickAt <= 0) {
        this.pick(scale)
        this.pickAt = 0.8
      }
      const lead = clamp(length(sub(this.prey.pos, this.pos)) / 17, 0, 0.9)
      // pursue: 小さな塊の平均速度から、短い先の位置を予測する。
      target = add(this.prey.pos, mul(this.prey.vel, lead))
      if (this.state === 'approach') {
        speed = 5.5
        arrival = 3
        if (length(sub(target, this.pos)) < 11 * scale || this.age > 6) {
          this.state = 'burst'
          this.age = 0
          this.exit = exitWithinView(
            add(target, mul(unit(sub(target, this.pos)), 16 * scale)),
            scale,
          )
        }
      } else if (this.state === 'burst') {
        speed = 21
        // 突進に入ったら出口へ seek し、逃げた魚を追ってその場で回らない。
        target = this.exit
        if (length(sub(target, this.pos)) < 3 || this.age > 2.7) {
          this.state = 'coast'
          this.age = 0
          this.exit = exitWithinView(
            add(this.pos, mul(this.dir, 9 * scale)),
            scale,
          )
        }
      } else if (this.state === 'coast') {
        target = this.exit
        speed = 5
        if (this.age > 1.4) {
          this.state = 'return'
          this.age = 0
          const side: Vec = [-this.dir[2], 0, this.dir[0]]
          const sign = dot(this.pos, side) > 0 ? -1 : 1
          this.orbit = add(
            add(this.pos, mul(this.dir, 3)),
            mul(side, sign * 13 * scale),
          )
          this.orbit[1] = clamp(
            this.pos[1] + (Math.random() - 0.5) * 8,
            -10 * scale,
            10 * scale,
          )
        }
      } else {
        // wander: 進行方向の先の円上を少しずつ揺らす。大回りの目標に混ぜる。
        this.wander += (Math.random() - 0.5) * 2.5 * Math.sqrt(dt)
        target = add(this.orbit, [
          Math.cos(this.wander) * 2,
          Math.sin(this.wander * 0.7),
          Math.sin(this.wander) * 2,
        ])
        speed = 6
        arrival = 5
        if (length(sub(this.orbit, this.pos)) < 5 || this.age > 4.5) {
          this.state = 'approach'
          this.age = 0
          this.pickAt = 0
        }
      }
    }
    const delta = sub(target, this.pos)
    if (mode === 'manual' && length(delta) < 0.3) speed = 0
    if (arrival > 0) speed *= Math.min(1, length(delta) / arrival)
    // desired velocity - velocity（seek / arrive）。力と角速度の両方に上限を設ける。
    const desired = mul(unit(delta), speed)
    let force = mul(sub(desired, this.vel), 1 / 0.65)
    const maxAcc = 13
    force = mul(force, Math.min(1, maxAcc / Math.max(length(force), 1e-8)))
    const proposed = add(this.vel, mul(force, dt))
    const oldSpeed = length(this.vel)
    const nextSpeed = clamp(
      length(proposed),
      Math.max(0, oldSpeed - maxAcc * dt),
      oldSpeed + maxAcc * dt,
    )
    const to = length(proposed) > 0.001 ? unit(proposed) : this.dir
    const angle = Math.acos(clamp(dot(this.dir, to), -1, 1))
    const speedAcc = (nextSpeed - oldSpeed) / dt
    const turnBudget =
      Math.sqrt(Math.max(0, maxAcc * maxAcc - speedAcc * speedAcc)) /
      Math.max(nextSpeed, oldSpeed, 0.5)
    const turn = Math.min(angle, 1.05 * dt, turnBudget * dt)
    const tangent = sub(to, mul(this.dir, dot(this.dir, to)))
    const axis =
      length(tangent) > 1e-6
        ? unit(tangent)
        : unit([-this.dir[2], 0.1, this.dir[0]])
    const nextDir = unit(
      add(mul(this.dir, Math.cos(turn)), mul(axis, Math.sin(turn))),
    )
    const signed = (this.dir[0] * nextDir[2] - this.dir[2] * nextDir[0]) / dt
    this.bend +=
      (clamp(signed / Math.max(nextSpeed, 2), -0.18, 0.18) *
        Math.min(1, nextSpeed / 2) -
        this.bend) *
      (1 - Math.exp(-dt * 5))
    this.dir = nextDir
    this.vel = mul(this.dir, nextSpeed)
    this.pos = add(this.pos, mul(this.vel, dt))
    this.phase += dt * (1.2 + nextSpeed * 0.16) * Math.PI * 2
  }
}

/** 胴と膜を同じ頂点形式で持ち、共有する頂点は index で参照する。 */
export const hunterMesh = () => {
  const vertices: number[] = []
  const indices: number[] = []
  const put = (p: Vec, normal: Vec, kind = 0, u = 0, v = 0, flap = 0) => {
    const i = vertices.length / 10
    vertices.push(
      ...p,
      ...(length(normal) > 1e-6 ? unit(normal) : [0, 0, 1]),
      kind,
      u,
      v,
      flap,
    )
    return i
  }
  const surface = (t: number, a: number): Vec => {
    const x = -2.65 + t * 5.95
    const body = Math.sin(Math.PI * t) ** 0.72 * (0.25 + t * 0.75)
    // 尾端を一点にせず、尾柄の細い断面を尾びれの根元まで残す。
    const radius = body + 0.09 * (1 - clamp(t / 0.14, 0, 1)) ** 2
    return [x, Math.cos(a) * radius * 1.05, Math.sin(a) * radius * 0.62]
  }
  const rings = 40
  const sides = 24
  for (let i = 0; i <= rings; i++) {
    const t = clamp(i / rings, 0.0001, 0.9999)
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2
      const dx = sub(
        surface(Math.min(0.99999, t + 0.0001), a),
        surface(Math.max(0.00001, t - 0.0001), a),
      )
      const da = sub(surface(t, a + 0.001), surface(t, a - 0.001))
      put(
        surface(t, a),
        unit([
          da[1] * dx[2] - da[2] * dx[1],
          da[2] * dx[0] - da[0] * dx[2],
          da[0] * dx[1] - da[1] * dx[0],
        ]),
      )
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j
      indices.push(a, a + sides + 1, a + 1, a + 1, a + sides + 1, a + sides + 2)
    }
  }
  // 根元から外縁へ張る膜。少しふくらませ、実際の曲面から法線を求める。
  const membrane = (
    point: (u: number, v: number) => Vec,
    rays: number,
    kind = 1,
    flap = 0,
  ) => {
    const base = vertices.length / 10
    const segments = 6
    for (let j = 0; j <= rays; j++) {
      const v = j / rays
      for (let i = 0; i <= segments; i++) {
        const u = i / segments
        const du = sub(
          point(Math.min(1, u + 0.001), v),
          point(Math.max(0, u - 0.001), v),
        )
        const dv = sub(
          point(u, Math.min(1, v + 0.001)),
          point(u, Math.max(0, v - 0.001)),
        )
        const normal = unit([
          du[1] * dv[2] - du[2] * dv[1],
          du[2] * dv[0] - du[0] * dv[2],
          du[0] * dv[1] - du[1] * dv[0],
        ])
        put(point(u, v), normal, kind, u, v, flap * u)
      }
    }
    for (let j = 0; j < rays; j++) {
      for (let i = 0; i < segments; i++) {
        const a = base + j * (segments + 1) + i
        indices.push(
          a,
          a + 1,
          a + segments + 1,
          a + 1,
          a + segments + 2,
          a + segments + 1,
        )
      }
    }
  }
  const dorsal = (
    front: number,
    rear: number,
    height: number,
    sign: number,
  ) => {
    membrane((u, v) => {
      const x = front + (rear - front) * v
      const root = surface((x + 2.65) / 5.95, sign > 0 ? 0 : Math.PI)
      // 前が立ち上がり、後ろへなだらかに低くなる外縁。
      const rise = Math.sin(Math.PI * v) ** 0.8 * (1.3 - v * 0.65) * height
      return [
        x - u * rise * 0.28,
        root[1] * 0.96 + sign * u * rise,
        Math.sin(Math.PI * u) * rise * 0.07,
      ]
    }, 16)
  }
  dorsal(1.2, -0.95, 0.9, 1)
  dorsal(-0.55, -1.9, 0.55, -1)
  for (let i = 0; i < 4; i++) {
    dorsal(-1.1 - i * 0.36, -1.39 - i * 0.36, 0.18 - i * 0.018, 1)
    dorsal(-1.85 - i * 0.17, -2.03 - i * 0.17, 0.12 - i * 0.012, -1)
  }
  for (const side of [-1, 1]) {
    membrane(
      (u, v) => {
        const root: Vec = [
          1.22 - v * 0.65,
          -0.2 - v * 0.08,
          side * (0.49 + v * 0.01),
        ]
        const span = Math.sin(Math.PI * v) ** 0.7
        return [
          root[0] - u * span * 1.15,
          root[1] - u * span * 0.38,
          root[2] + side * u * span * 0.9,
        ]
      },
      14,
      2,
      side,
    )
    // 尾柄に重なる根元から、前縁と深くえぐれた後縁の間を張る。
    membrane(
      (u, v) => {
        const y = side * v * 1.4
        const leading = -2.6 - 1.08 * v ** 1.35
        const trailing = leading - 0.35 * (1 - v) ** 0.7
        return [
          leading + (trailing - leading) * u,
          y,
          Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * 0.035,
        ]
      },
      22,
      3,
    )
  }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint16Array(indices),
  }
}
