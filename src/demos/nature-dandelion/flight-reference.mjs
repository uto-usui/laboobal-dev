// ブラウザを使わずに、staggered grid と種の軌道を調べる数値参照実装。
// 格子は Float32、種は倍精度。GPU の丸めや描画結果そのものの検査ではない。
import { rootDirection, variation } from './interaction.ts'

const dims = [40, 24, 12]
const spacing = [8 / 40, 4 / 24, 6 / 12]
const origin = [-4, -1.6, -2]
const cells = dims.reduce((a, b) => a * b, 1)
const strides = [1, dims[0], dims[0] * dims[1]]
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const normalize = (v) => v.map((x) => x / Math.hypot(...v))
const pcg = (v) => {
  const s = (Math.imul(v, 747796405) + 2891336453) >>> 0
  const w = Math.imul((s >>> ((s >>> 28) + 4)) ^ s, 277803737) >>> 0
  return ((w >>> 22) ^ w) >>> 0
}
const traitsFor = (i) => {
  const seed = i * 389 + 71
  return [seed, seed ^ 0x9e3779b9, seed ^ 0x85ebca6b].map(
    (v) => pcg(v) / 4294967295,
  )
}
export const limit = (v, maximum) => {
  const scale = Math.min(1, maximum / Math.max(Math.hypot(...v), 1e-6))
  return v.map((x) => x * scale)
}

export const createField = () => {
  let field = new Float32Array(cells * 3)
  const advected = new Float32Array(cells * 3)
  const divergence = new Float32Array(cells)
  const pressures = [new Float32Array(cells), new Float32Array(cells)]
  const coords = Array.from({ length: cells }, (_, i) => [
    i % dims[0],
    Math.floor(i / dims[0]) % dims[1],
    Math.floor(i / (dims[0] * dims[1])),
  ])
  const centers = coords.map((c) =>
    c.map((v, axis) => origin[axis] + (v + 0.5) * spacing[axis]),
  )
  const sample = (p) => {
    const velocity = [0, 0, 0]
    for (let axis = 0; axis < 3; axis++) {
      const grid = p.map((v, j) =>
        clamp(
          (v - origin[j]) / spacing[j] - 0.5 - (axis === j ? 0.5 : 0),
          -1,
          dims[j],
        ),
      )
      const c = grid.map(Math.floor)
      const f = grid.map((v, j) => v - c[j])
      for (let z = 0; z < 2; z++)
        for (let y = 0; y < 2; y++)
          for (let x = 0; x < 2; x++) {
            const corner = [c[0] + x, c[1] + y, c[2] + z]
            if (corner[axis] < 0 || corner[axis] >= dims[axis] - 1) continue
            const bounded = corner.map((v, j) => clamp(v, 0, dims[j] - 1))
            const index = bounded.reduce((sum, v, j) => sum + v * strides[j], 0)
            const weight = [x, y, z].reduce(
              (product, v, j) => product * (v ? f[j] : 1 - f[j]),
              1,
            )
            velocity[axis] += field[index * 3 + axis] * weight
          }
    }
    return velocity
  }
  return {
    sample,
    step(dt, breath, impulse, breeze = 0) {
      for (let i = 0; i < cells; i++) {
        const c = coords[i]
        for (let axis = 0; axis < 3; axis++) {
          if (c[axis] === dims[axis] - 1) {
            advected[i * 3 + axis] = 0
            continue
          }
          const p = [...centers[i]]
          p[axis] += 0.5 * spacing[axis]
          const velocity = sample(p)
          const midpoint = p.map((v, j) => v - velocity[j] * dt * 0.5)
          const middleVelocity = sample(midpoint)
          const transported = sample(
            p.map((v, j) => v - middleVelocity[j] * dt),
          )[axis]
          const delta = [
            (p[0] - breath[0]) / 0.25,
            (p[1] - breath[1]) / 0.25,
            p[2] / 0.42,
          ]
          const jet =
            Math.exp(-delta.reduce((sum, v) => sum + v * v, 0) * 0.5) *
            breath[2]
          const curl = [
            0.55 * Math.cos(p[1] * 1.1) - 0.4 * Math.cos(p[2] * 1.3),
            0.45 * Math.cos(p[2] * 1.2) - 0.55 * Math.cos(p[0] * 1.1),
            0.4 * Math.cos(p[0] * 1.3) - 0.45 * Math.cos(p[1] * 1.2),
          ]
          const ambient = ([0.17, 0.045, 0][axis] + curl[axis] * 0.095) * breeze
          const driven =
            transported +
            (impulse[axis] - transported) * (1 - Math.exp(-jet * 42 * dt))
          advected[i * 3 + axis] =
            driven * Math.exp(-0.18 * dt) + ambient * 0.7 * dt
        }
      }
      for (let i = 0; i < cells; i++) {
        divergence[i] = coords[i].reduce(
          (sum, v, axis) =>
            sum +
            (advected[i * 3 + axis] -
              (v > 0 ? advected[(i - strides[axis]) * 3 + axis] : 0)) /
              spacing[axis],
          0,
        )
      }
      for (const p of pressures) p.fill(0)
      for (let iteration = 0; iteration < 36; iteration++) {
        const source = pressures[iteration % 2]
        const target = pressures[1 - (iteration % 2)]
        for (let i = 0; i < cells; i++) {
          let total = 0
          let weight = 0
          for (let axis = 0; axis < 3; axis++) {
            const coefficient = 1 / spacing[axis] ** 2
            for (const side of [-1, 1]) {
              const neighbor = coords[i][axis] + side
              if (neighbor < 0 || neighbor >= dims[axis]) continue
              total += source[i + side * strides[axis]] * coefficient
              weight += coefficient
            }
          }
          target[i] = (total - divergence[i]) / weight
        }
      }
      const projected = new Float32Array(field.length)
      for (let i = 0; i < cells; i++)
        for (let axis = 0; axis < 3; axis++)
          if (coords[i][axis] < dims[axis] - 1)
            projected[i * 3 + axis] =
              advected[i * 3 + axis] -
              (pressures[0][i + strides[axis]] - pressures[0][i]) /
                spacing[axis]
      field = projected
    },
  }
}

export const createSeed = (i, head, example = -1) => {
  const { direction, angle } = rootDirection(i, 72)
  const s = {
    i,
    pos: direction.map((v, j) => v * 0.265 + [...head, 0][j]),
    vel: [0, 0, 0],
    axis: [...direction],
    angular: [0, 0, 0],
    spin: angle,
    age: 0,
    flying: false,
    traits: traitsFor(i),
  }
  if (example >= 0) {
    const tilt = [-0.38, 0.29, -0.19, 0.42][example]
    s.pos = [
      head[0] + [0.48, 1.08, 0.73, 1.52][example],
      head[1] + [0.29, 0.48, 0.82, 0.2][example],
      [-1.15, 0.18, 1.65, -0.55][example],
    ]
    s.vel = [
      0.1 + variation(i + 9) * 0.12,
      (variation(i + 19) - 0.5) * 0.08,
      (variation(i + 29) - 0.5) * 0.14,
    ]
    s.axis = [Math.sin(tilt), Math.cos(tilt), 0]
    s.age = [2.3, 6.8, 4.1, 9.6][example]
    s.flying = true
  }
  return s
}

export const stepSeed = (s, air, dt, time, caps) => {
  const flow = caps ? limit(air, caps.air) : air
  if (!s.flying) {
    s.flying = true
    s.vel = caps ? limit(flow, caps.initial) : [...flow]
    if (caps) {
      s.axis = normalize([s.axis[0] * 0.3, 1, s.axis[2] * 0.3])
      s.angular = [0, 0, 0]
    } else s.angular = cross(s.axis, [0, 1, 0]).map((v) => v * 0.4)
  }
  const relative = flow.map((v, j) => v - s.vel[j])
  const dot = relative.reduce((sum, v, j) => sum + v * s.axis[j], 0)
  const axial = s.axis.map((v) => v * dot)
  s.vel = s.vel.map(
    (v, j) =>
      v +
      ((relative[j] - axial[j]) * 1.8 + axial[j] * 4.6 + [0, -0.22, 0][j]) * dt,
  )
  if (caps) s.vel = limit(s.vel, caps.seed)
  s.pos = s.pos.map((v, j) => v + s.vel[j] * dt)
  s.age += dt
  const [x, y, z] = s.traits
  const phase = x * 6.283185
  const lean =
    (y - 0.5) * 0.66 + Math.sin(time * (0.6 + z * 0.35) + phase) * 0.15
  const desired = normalize([
    Math.tan(lean) - relative[0] * 0.45,
    1,
    (z - 0.5) * 0.48 + Math.cos(time * 0.49 + phase) * 0.12,
  ])
  const torque = cross(s.axis, desired)
  s.angular = s.angular.map(
    (v, j) => (v + torque[j] * 5.5 * dt) * Math.exp(-2.8 * dt),
  )
  const rotation = cross(s.angular, s.axis)
  s.axis = normalize(s.axis.map((v, j) => v + rotation[j] * dt))
  s.spin += dt * (x > 0.5 ? 1 : -1) * (0.12 + z * 0.22)
}

export const projectSeed = (s, width = 1280, height = 800) => {
  const scale = 1 / Math.max(0.5, 1 + s.pos[2] * 0.22)
  return [
    (((s.pos[0] * scale) / (width / height) + 1) * width) / 2,
    ((1 - s.pos[1] * scale) * height) / 2,
  ]
}
