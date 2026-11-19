import {
  add,
  apply,
  cross,
  dot,
  mul,
  product,
  Rod,
  rotation,
  sub,
  transpose,
  unit,
  type Grip,
  type Vec,
} from './rod'
import { POINT_STRIDE, SNOW_STRIDE, STEP, type Scene } from './scene'
import { snowShape, snowVolume } from './snow-shape'
import {
  capsuleContact,
  colliders,
  ContactResponse,
  type Collider,
} from './contact'

export const FIELDS = {
  view: 'vec4f',
  grip: 'vec4f',
  dt: 'f32',
  nodeCount: 'u32',
  branchCount: 'u32',
  snowCount: 'u32',
  gripOn: 'u32',
  settling: 'u32',
  renew: 'u32',
  adhesion: 'f32',
  brightness: 'f32',
  interpolation: 'f32',
  gripEdge: 'u32',
  gripT: 'f32',
} as const
export const STRUCTS = /* wgsl */ `
struct Point { p: vec4f, previous: vec4f, rest: vec4f, director: vec4f, lateral: vec4f }
struct Snow {
  center: vec4f, size: vec4f, state: vec4f, spare: vec4f,
  origin: vec4f, axisX: vec4f, axisY: vec4f, axisZ: vec4f,
  oldOrigin: vec4f, oldX: vec4f, oldY: vec4f, oldZ: vec4f,
}
`
export interface Input {
  view: number[]
  gripOn: number
  grip: number[]
  gripEdge: number
  gripT: number
  settling: number
  renew: number
  adhesion: number
}
interface Chunk {
  attached: boolean
  sleeping: boolean
  growth: number
  mass: number
  damage: number
  erosion: number
  age: number
  origin: Vec
  com: Vec
  basis: Vec[]
  velocity: Vec
  spin: Vec
  local: Vec
  localVelocity: Vec
  tilt: Vec
  tiltVelocity: Vec
  supportAcceleration: Vec
  previousSupport: Vec
  supportVelocity: Vec
  volumes: number[]
  erosionVolumes: number[]
}
const sampleVolume = (table: number[], t: number) => {
  const x = Math.min(32, Math.max(0, t * 32)),
    i = Math.min(31, Math.floor(x))
  return table[i] + (table[i + 1] - table[i]) * (x - i)
}
export class BoughPhysics {
  rod: Rod
  chunks: Chunk[]
  nodes: Float32Array<ArrayBuffer>
  snow: Float32Array<ArrayBuffer>
  wait = 0
  input: Input = {
    view: [0, 0.5, 7.2, 4.5],
    gripOn: 0,
    grip: [0, 0, 0, 0],
    gripEdge: 0,
    gripT: 0,
    settling: 0,
    renew: 1,
    adhesion: 1,
  }
  bonds: { a: number; b: number; damage: number; intact: boolean }[]
  scene: Scene
  constructor(scene: Scene) {
    this.scene = scene
    const rest = Array.from({ length: scene.branchCount }, (_, i) =>
      Array.from(scene.nodes.slice(i * POINT_STRIDE, i * POINT_STRIDE + 3)),
    )
    const links = Array.from({ length: scene.segments.length / 4 }, (_, i) =>
      Array.from(scene.segments.slice(i * 4, i * 4 + 2)),
    )
    this.rod = new Rod(
      rest,
      links,
      links.map(
        ([a, b]) => (scene.nodes[a * 20 + 7] + scene.nodes[b * 20 + 7]) / 2,
      ),
      scene.compact ? 1.25e7 : 1.8e7,
    )
    this.nodes = scene.nodes.slice()
    this.snow = new Float32Array(scene.snows.length * SNOW_STRIDE)
    this.chunks = scene.snows.map((s) => {
      const basis = this.rod.frames[s.edge].map((a) => a.slice()),
        origin = s.center.slice()
      return {
        attached: true,
        sleeping: false,
        growth: 1,
        mass: s.mass,
        damage: 0,
        erosion: 0,
        age: 0,
        origin,
        com: add(origin, apply(basis, [0, s.size[1] * 0.4, 0])),
        basis,
        velocity: [0, 0, 0],
        spin: [0, 0, 0],
        local: [0, 0, 0],
        localVelocity: [0, 0, 0],
        tilt: [0, 0, 0],
        tiltVelocity: [0, 0, 0],
        supportAcceleration: [0, 0, 0],
        previousSupport: origin.slice(),
        supportVelocity: [0, 0, 0],
        volumes: Array.from({ length: 33 }, (_, i) =>
          snowVolume(s.phase, i / 32),
        ),
        erosionVolumes: [],
      }
    })
    this.bonds = []
    scene.snows.forEach((s, i) => {
      if (i > 0 && scene.snows[i - 1].band === s.band)
        this.bonds.push({ a: i - 1, b: i, damage: 0, intact: true })
    })
    this.write(true)
  }
  support(i: number) {
    const s = this.scene.snows[i],
      edge = this.rod.edges[s.edge]
    return this.rod.site(s.edge, s.t, [0, edge.radius + 0.045, 0])
  }
  // 破断は拘束だけを外す。直前までの支持面の並進・回転速度を残す。
  release(i: number) {
    const c = this.chunks[i]
    if (!c.attached) return
    c.attached = false
    c.age = 0
    const s = this.scene.snows[i]
    c.erosionVolumes = Array.from({ length: 33 }, (_, k) =>
      snowVolume(s.phase, c.growth, k / 32),
    )
    this.bonds.forEach((b) => {
      if (b.a === i || b.b === i) b.intact = false
    })
  }
  renew() {
    this.chunks.forEach((c, i) => {
      c.attached = true
      c.sleeping = false
      c.growth = 0
      c.mass = 0
      c.damage = 0
      c.erosion = 0
      c.age = 0
      c.local = [0, 0, 0]
      c.localVelocity = [0, 0, 0]
      c.tilt = [0, 0, 0]
      c.tiltVelocity = [0, 0, 0]
      c.basis = this.rod.frames[this.scene.snows[i].edge].map((a) => a.slice())
      c.origin = this.support(i)
      c.com = c.origin.slice()
      c.velocity = [0, 0, 0]
      c.spin = [0, 0, 0]
      c.supportAcceleration = [0, 0, 0]
      c.previousSupport = c.origin.slice()
      c.supportVelocity = [0, 0, 0]
    })
    this.bonds.forEach((b) => {
      b.intact = true
      b.damage = 0
    })
    this.write(true)
  }
  step() {
    const dt = STEP,
      gravity = [0, -2.8, 0],
      u = this.input
    if (
      this.chunks.every((c) => c.sleeping) &&
      !u.gripOn &&
      u.renew &&
      !u.settling
    ) {
      this.wait += dt
      if (this.wait >= 4) {
        this.renew()
        this.wait = 0
      }
    } else this.wait = 0
    for (const [i, c] of this.chunks.entries()) {
      if (c.attached && c.growth < 1 && !u.gripOn && u.renew && !u.settling) {
        c.growth = Math.min(1, c.growth + dt / 3.5)
        const s = this.scene.snows[i]
        c.mass = (s.mass * sampleVolume(c.volumes, c.growth)) / c.volumes[32]
      }
    }
    const loads = this.chunks.flatMap((c, i) =>
      c.attached
        ? [
            {
              edge: this.scene.snows[i].edge,
              t: this.scene.snows[i].t,
              offset: add(
                [
                  0,
                  this.rod.edges[this.scene.snows[i].edge].radius +
                    0.045 +
                    this.scene.snows[i].size[1] * c.growth * 0.4,
                  0,
                ],
                c.local,
              ),
              mass: c.mass,
            },
          ]
        : [],
    )
    let grip: Grip | undefined
    if (u.gripOn) {
      const current = this.rod.site(u.gripEdge, u.gripT)
      grip = {
        edge: u.gripEdge,
        t: u.gripT,
        target: [u.grip[0] + u.grip[2], u.grip[1] + u.grip[3], current[2]],
      }
    }
    const oldPositions = this.rod.positions.map((p) => p.slice())
    const oldFrames = this.rod.frames.map((f) => f.map((a) => a.slice()))
    this.rod.step(dt, loads, gravity, grip)
    let surfaces: [Collider[], Collider[]] | undefined
    let response: ContactResponse | undefined
    for (const [i, c] of this.chunks.entries()) {
      if (c.sleeping) continue
      const s = this.scene.snows[i],
        support = this.support(i),
        basis = this.rod.frames[s.edge]
      const supportVelocity = mul(sub(support, c.previousSupport), 1 / dt)
      const acceleration = mul(sub(supportVelocity, c.supportVelocity), 1 / dt)
      const attachedAtStart = c.attached
      if (c.attached) {
        // pointer 入力の段差を材料の破断へ直結させず、短い接触時間で平均する。
        c.supportAcceleration = add(
          mul(c.supportAcceleration, Math.exp(-dt / 0.045)),
          mul(acceleration, 1 - Math.exp(-dt / 0.045)),
        )
        const effective = apply(
          transpose(basis),
          sub(gravity, c.supportAcceleration),
        )
        const normal = Math.max(0, -effective[1]) * c.mass
        const shear = c.mass * Math.hypot(effective[0], effective[2])
        const lift = c.mass * Math.max(0, effective[1])
        const area = 4 * s.size[0] * Math.min(0.26, s.size[2]) * c.growth
        const capacity =
          area * (0.21 + 0.1 * Math.sin(s.phase * 2.71 + 1) ** 2) * u.adhesion
        const friction = Math.tan(
          ((38 + 5 * Math.sin(s.phase * 1.7) ** 2) * Math.PI) / 180,
        )
        const demand = lift + Math.max(0, shear - friction * normal)
        const overload = Math.max(0, demand / Math.max(0.00001, capacity) - 1)
        c.damage = Math.max(
          0,
          c.damage + dt * (Math.min(3, overload) - (overload === 0 ? 0.3 : 0)),
        )
        // 静止摩擦と付着で支えきれる間は面と一緒に動く。法線方向のばねは
        // 雪だけを空中に残すため使わず、破断まで下面を支持面へ拘束する。
        c.local[1] = 0
        c.localVelocity[1] = 0
        for (const k of [0, 2]) {
          const speed = Math.hypot(c.localVelocity[0], c.localVelocity[2])
          const sticking =
            speed < 0.002 && shear <= friction * normal + capacity
          const resistance =
            (0.58 * normal + capacity * 0.35) / Math.max(c.mass, 0.00001)
          const velocity = c.localVelocity[k] + effective[k] * dt
          c.localVelocity[k] = sticking
            ? 0
            : Math.sign(velocity) *
              Math.max(0, Math.abs(velocity) - resistance * dt)
          c.local[k] += c.localVelocity[k] * dt
        }
        c.tilt = [0, 0, 0]
        c.tiltVelocity = [0, 0, 0]
        const localBasis = rotation(c.tilt)
        const oldBasis = c.basis
        c.basis = product(basis, localBasis)
        c.origin = add(support, apply(basis, c.local))
        const nextCom = add(
          c.origin,
          apply(c.basis, [0, s.size[1] * c.growth * 0.4, 0]),
        )
        c.velocity = mul(sub(nextCom, c.com), 1 / dt)
        c.com = nextCom
        const delta = product(c.basis, transpose(oldBasis))
        const sineAxis = [
          delta[1][2] - delta[2][1],
          delta[2][0] - delta[0][2],
          delta[0][1] - delta[1][0],
        ]
        const sine = Math.hypot(...sineAxis) * 0.5,
          cosine = (delta[0][0] + delta[1][1] + delta[2][2] - 1) * 0.5
        c.spin = mul(
          sineAxis,
          Math.atan2(sine, cosine) / (Math.max(1e-9, sine) * 2 * dt),
        )
        c.previousSupport = support
        c.supportVelocity = supportVelocity
        if (
          !u.settling &&
          c.growth > 0.15 &&
          (c.damage > 0.1 ||
            Math.abs(c.local[2]) > 0.32 ||
            Math.abs(c.local[0]) > s.size[0] * 0.8)
        )
          this.release(i)
      }
      if (!c.attached) {
        const advance = !attachedAtStart
        c.age += dt
        surfaces ??= [
          colliders(this.scene, this.rod, oldPositions, oldFrames),
          colliders(this.scene, this.rod, this.rod.positions, this.rod.frames),
        ]
        response ??= new ContactResponse(this.rod, loads, dt, grip)
        this.fall(i, surfaces[0], surfaces[1], response, gravity, dt, advance)
        // 角から削れる。画面の下へ達するまでは核を残し、途中で消さない。
        c.erosion = Math.min(0.8, c.age * 0.26)
        const oldMass = c.mass
        c.mass =
          (s.mass * sampleVolume(c.erosionVolumes, c.erosion)) / c.volumes[32]
        // 削れた雪も同じ速度で運動量を持ち去るので、残った核の速度は変えない。
        this.shedMass += oldMass - c.mass
        this.shedMomentum = add(
          this.shedMomentum,
          mul(c.velocity, oldMass - c.mass),
        )
        if (c.origin[1] < u.view[1] - u.view[3] - 1) c.sleeping = true
      }
    }
    // 接触点で求めた等しい逆向きの運動量を棒へ返す。位置は次の固定刻みで進む。
    response?.delta.forEach((v, k) => {
      this.rod.velocity[k] += v
    })
    for (const bond of this.bonds) {
      if (!bond.intact) continue
      const a = this.chunks[bond.a],
        b = this.chunks[bond.b]
      const gap = Math.hypot(...sub(a.local, b.local))
      bond.damage = Math.max(
        0,
        bond.damage + dt * (Math.max(0, gap / 0.045 - 1) - 0.3),
      )
      if (bond.damage > 0.08 || !a.attached || !b.attached) {
        bond.intact = false
        continue
      }
      // 境目の付着は近い小塊の滑りだけを伝える。帯全体の解除フラグは持たない。
      const reducedMass =
        (a.mass * b.mass) / Math.max(0.000001, a.mass + b.mass)
      const impulse = mul(sub(b.local, a.local), dt * 2 * reducedMass)
      a.localVelocity = add(
        a.localVelocity,
        mul(impulse, 1 / Math.max(0.000001, a.mass)),
      )
      b.localVelocity = sub(
        b.localVelocity,
        mul(impulse, 1 / Math.max(0.000001, b.mass)),
      )
    }
    this.write()
  }
  fall(
    i: number,
    before: Collider[],
    after: Collider[],
    response: ContactResponse,
    gravity: Vec,
    dt: number,
    advance = true,
  ) {
    const c = this.chunks[i],
      s = this.scene.snows[i]
    let motion = Math.hypot(...c.velocity) * dt
    after.forEach((p, k) => {
      motion = Math.max(
        motion,
        Math.hypot(...sub(p.a, before[k].a)),
        Math.hypot(...sub(p.b, before[k].b)),
      )
    })
    const steps = Math.min(
      64,
      Math.max(
        4,
        Math.ceil(motion / 0.018),
        Math.ceil((Math.hypot(...c.spin) * dt) / 0.05),
      ),
    )
    const h = advance ? dt / steps : 0
    const half = [
      s.size[0] * 0.96,
      s.size[1] * c.growth * 0.44,
      s.size[2] * 0.85,
    ].map((v) => v * (1 - c.erosion * 0.2))
    const inertia = (c.mass * (half[0] ** 2 + half[1] ** 2 + half[2] ** 2)) / 3
    const radius = Math.hypot(...half) + motion + 0.04
    const candidates = after.flatMap((p, k) => {
      const old = before[k]
      return [0, 1, 2].some(
        (axis) =>
          Math.min(p.a[axis], p.b[axis], old.a[axis], old.b[axis]) >
            c.com[axis] + radius ||
          Math.max(p.a[axis], p.b[axis], old.a[axis], old.b[axis]) <
            c.com[axis] - radius,
      )
        ? []
        : [k]
    })
    for (let step = 1; step <= steps; step++) {
      const orientation = apply(transpose(c.basis), unit(c.velocity))
      // 同じ重力でも、投影面積と質量の違いで終端速度を変える。
      const area =
        4 *
        (Math.abs(orientation[0]) * half[1] * half[2] +
          Math.abs(orientation[1]) * half[0] * half[2] +
          Math.abs(orientation[2]) * half[0] * half[1])
      const drag =
        ((0.007 + 0.004 * Math.sin(s.phase * 2.3) ** 2) * area) /
        Math.max(c.mass, 0.00001)
      c.velocity = mul(
        add(c.velocity, mul(gravity, h)),
        1 / (1 + drag * Math.hypot(...c.velocity) * h),
      )
      c.spin = mul(c.spin, Math.exp(-0.16 * h))
      c.com = add(c.com, mul(c.velocity, h))
      c.basis = product(rotation(mul(c.spin, h)), c.basis)
      for (let iteration = 0; iteration < 8; iteration++) {
        let deepest:
          | {
              depth: number
              normal: Vec
              point: Vec
              speed: Vec
              edge: number
              needle: boolean
            }
          | undefined
        candidates.forEach((k) => {
          const p = after[k],
            old = before[k],
            t = advance ? step / steps : 1
          const a = add(old.a, mul(sub(p.a, old.a), t)),
            b = add(old.b, mul(sub(p.b, old.b), t))
          const ab = sub(b, a)
          const f = Math.max(
            0,
            Math.min(1, dot(sub(c.com, a), ab) / Math.max(1e-12, dot(ab, ab))),
          )
          const point = add(a, mul(ab, f))
          // broad phase は回転している雪も覆う球で行う。
          if (Math.hypot(...sub(point, c.com)) > Math.hypot(...half) + p.radius)
            return
          const contact = capsuleContact(a, b, c.basis, c.com, half, p.radius)
          if (!contact || (deepest && contact.depth <= deepest.depth)) return
          const oldPoint = add(old.a, mul(sub(old.b, old.a), contact.fraction))
          const newPoint = add(p.a, mul(sub(p.b, p.a), contact.fraction))
          deepest = {
            depth: contact.depth,
            normal: contact.normal,
            point: contact.point,
            speed: mul(sub(newPoint, oldPoint), 1 / dt),
            edge: p.edge,
            needle: p.needle,
          }
        })
        if (!deepest) break
        const hit = deepest
        c.com = add(c.com, mul(hit.normal, hit.depth + 0.00001))
        const lever = sub(hit.point, c.com)
        const relative = sub(
          add(c.velocity, cross(c.spin, lever)),
          add(hit.speed, response.velocity(hit.edge, hit.point)),
        )
        const vn = dot(relative, hit.normal)
        if (vn >= 0) continue
        const axis = cross(lever, hit.normal)
        const inverseMass = 1 / Math.max(0.00001, c.mass)
        const normalResponse = response.at(hit.edge, hit.point, hit.normal)
        const branchInverseMass = normalResponse.inverseMass
        const impulse =
          (-(1 + (hit.needle ? 0.02 : 0.12)) * vn) /
          (inverseMass +
            branchInverseMass +
            dot(axis, axis) / Math.max(1e-7, inertia))
        const tangent = sub(relative, mul(hit.normal, vn)),
          speed = Math.hypot(...tangent)
        const tangentAxis =
          speed > 1e-9 ? cross(lever, mul(tangent, 1 / speed)) : [0, 0, 0]
        const tangentDirection = mul(tangent, 1 / Math.max(speed, 1e-9))
        const tangentResponse = response.at(
          hit.edge,
          hit.point,
          tangentDirection,
        )
        const friction = Math.min(
          (hit.needle ? 0.65 : 0.45) * impulse,
          speed /
            (inverseMass +
              tangentResponse.inverseMass +
              dot(tangentAxis, tangentAxis) / Math.max(1e-7, inertia)),
        )
        const total = sub(
          mul(hit.normal, impulse),
          mul(tangent, friction / Math.max(1e-9, speed)),
        )
        c.velocity = add(c.velocity, mul(total, inverseMass))
        c.spin = add(
          c.spin,
          mul(cross(lever, total), 1 / Math.max(1e-7, inertia)),
        )
        response.impulse(normalResponse.response, impulse)
        response.impulse(tangentResponse.response, -friction)
        this.contacts++
      }
    }
    c.origin = sub(c.com, apply(c.basis, [0, s.size[1] * c.growth * 0.4, 0]))
  }
  contacts = 0
  shedMass = 0
  shedMomentum = [0, 0, 0]
  write(initial = false) {
    for (let id = 0; id < this.scene.branchCount; id++) {
      const at = id * 20
      this.nodes.set(this.nodes.slice(at, at + 3), at + 4)
      this.nodes.set(this.rod.positions[id], at)
      const edge = this.rod.edges.findIndex((e) => e.b === id)
      const basis =
        edge < 0 ? this.rod.edges[0].restFrame : this.rod.frames[edge]
      this.nodes.set(basis[1], at + 12)
      this.nodes.set(basis[2], at + 16)
    }
    this.chunks.forEach((c, i) => {
      const s = this.scene.snows[i],
        at = i * SNOW_STRIDE
      this.snow.copyWithin(at + 32, at + 16, at + 32)
      const oldGrowth = this.snow[at + 11],
        oldErosion = this.snow[at + 9]
      this.snow.set(
        [
          ...s.center,
          s.start,
          ...s.size,
          s.anchor,
          c.attached ? 1 : 0,
          c.erosion,
          c.sleeping ? 1 : 0,
          c.growth,
          oldGrowth,
          s.supports[0],
          s.supports[1],
          oldErosion,
          ...c.origin,
          s.phase,
          ...c.basis[0],
          0,
          ...c.basis[1],
          0,
          ...c.basis[2],
          0,
        ],
        at,
      )
      for (let z = 0; z < 5; z++)
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 5; x++) {
            const id = s.start + x + 5 * (y + 4 * z),
              p = id * 20
            this.nodes.set(this.nodes.slice(p, p + 3), p + 4)
            const q = snowShape(
              x / 2 - 1,
              y / 1.5 - 1,
              z / 2 - 1,
              s.phase,
              c.growth,
              c.erosion,
            )
            this.nodes.set(
              add(
                c.origin,
                apply(
                  c.basis,
                  q.map((v, k) => v * s.size[k]),
                ),
              ),
              p,
            )
          }
      if (initial) {
        this.snow.copyWithin(at + 32, at + 16, at + 32)
        this.snow[at + 12] = c.growth
        this.snow[at + 15] = c.erosion
      }
    })
    if (initial)
      for (let id = 0; id < this.scene.count; id++)
        this.nodes.set(this.nodes.slice(id * 20, id * 20 + 3), id * 20 + 4)
  }
}
