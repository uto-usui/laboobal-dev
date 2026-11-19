import { ANGULAR_COUNT, DISK_RADIUS } from './appearance'

export const MASS_COUNT = 2048
export const SOFTENING = 0.22
export const STEP = 0.0125
export const COMPANION_SCALE = 0.78
export const COMPANION_MASS = 0.65
export const START_X = 2.7
export const APPROACH_SPEED = 0.48
export const passageSpeed = (passage: number) => 0.08 + passage * 0.1

const TAU = Math.PI * 2
const random = (seed: number) => {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return (s + 0.5) / 4294967296
  }
}

type V3 = [number, number, number]
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const unit = (p: V3): V3 => {
  const r = Math.hypot(...p) || 1
  return p.map((v) => v / r) as V3
}

const tilt = ([x, y, z]: V3, angle: number): V3 => [
  x,
  y * Math.cos(angle) - z * Math.sin(angle),
  y * Math.sin(angle) + z * Math.cos(angle),
]

// 球対称な成分も固定した中心にはせず、一つずつ軌道を持つ質量点にする。
const localMass = () => {
  const rng = random(92741)
  const points: V3[] = []
  const axes: V3[] = []
  const weights: number[] = []
  for (let k = 0; k < 256; k++) {
    const disk = k < 64
    const q = ((disk ? k : k - 64) + 0.5) / (disk ? 64 : 192)
    const f = q * 0.925
    const r = (disk ? 0.65 : 0.85) / Math.sqrt(f ** (-2 / 3) - 1)
    const a = TAU * rng()
    const z = disk ? 0 : rng() * 2 - 1
    const ring = Math.sqrt(1 - z * z)
    const p: V3 = [r * ring * Math.cos(a), r * ring * Math.sin(a), r * z]
    const axis: V3 = disk
      ? [0, 0, 1]
      : unit(cross(p, [rng() - 0.5, rng() - 0.5, rng() - 0.5]))
    const reflected: V3 = disk ? [-p[1], p[0], 0] : [p[0], p[1], -p[2]]
    const reflectedAxis: V3 = disk ? axis : [-axis[0], -axis[1], axis[2]]
    // 上下も対にする。球状成分の標本の偏りで、単独の円盤を厚くしないため。
    points.push(
      p,
      p.map((v) => -v) as V3,
      reflected,
      reflected.map((v) => -v) as V3,
    )
    axes.push(axis, axis, reflectedAxis, reflectedAxis)
    const weight = disk ? 0.1 / 256 : 0.9 / 768
    weights.push(weight, weight, weight, weight)
  }
  const velocities = points.map((p, i) => {
    let inward = 0
    const r = Math.hypot(...p)
    for (const [j, other] of points.entries()) {
      const d = other.map((v, j) => v - p[j])
      const rr = d.reduce((s, v) => s + v * v, SOFTENING ** 2)
      inward -=
        ((d[0] * p[0] + d[1] * p[1] + d[2] * p[2]) * weights[j]) /
        (rr ** 1.5 * r)
    }
    const speed = Math.sqrt(Math.max(0, inward) * r)
    return unit(cross(axes[i], p)).map((v) => v * speed) as V3
  })
  return { points, velocities, weights }
}

const template = localMass()
const circularSpeed = Array.from({ length: 257 }, (_, index) => {
  const r = Math.max(0.001, (index / 256) * 3.6)
  let inward = 0
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU
    const x = Math.cos(a)
    const y = Math.sin(a)
    for (const [j, p] of template.points.entries()) {
      const dx = p[0] - r * x
      const dy = p[1] - r * y
      const rr = dx * dx + dy * dy + p[2] * p[2] + SOFTENING ** 2
      inward -= ((dx * x + dy * y) * template.weights[j]) / (24 * rr ** 1.5)
    }
  }
  return Math.sqrt(Math.max(0, inward) * r)
})

export const initialState = (
  lightCount: number,
  passage: number,
  isolated = false,
) => {
  const mass = new Float32Array(MASS_COUNT * 8)
  const light = new Float32Array(lightCount * 8)
  const material = new Float32Array(lightCount * 4)
  const rows = lightCount / 2 / ANGULAR_COUNT
  const indices: number[] = []
  const sideways = passageSpeed(passage)
  const put = (
    out: Float32Array,
    i: number,
    galaxy: number,
    p: V3,
    v: V3,
    weight: number,
    color: number,
  ) => {
    const angle = galaxy === 0 ? 0.12 : -0.1
    const scale = galaxy === 0 ? 1 : COMPANION_SCALE
    const massRatio = galaxy === 0 ? 1 : COMPANION_MASS
    const position = tilt(p.map((x) => x * scale) as V3, angle)
    const velocity = tilt(
      v.map((x) => x * Math.sqrt(massRatio / scale)) as V3,
      angle,
    )
    const side = galaxy === 0 ? -1 : 1
    out.set(
      [
        position[0] + (isolated ? galaxy * 50 : side * START_X),
        position[1] + (isolated ? 0 : side * 0.65),
        position[2],
        weight * massRatio,
        velocity[0] - (isolated ? 0 : side * APPROACH_SPEED),
        velocity[1] + (isolated ? 0 : side * sideways),
        velocity[2],
        color,
      ],
      i * 8,
    )
  }
  for (let galaxy = 0; galaxy < 2; galaxy++) {
    for (let i = 0; i < 1024; i++) {
      put(
        mass,
        galaxy * 1024 + i,
        galaxy,
        template.points[i],
        template.velocities[i],
        template.weights[i],
        galaxy,
      )
    }
    const half = lightCount / 2
    for (let i = 0; i < half; i++) {
      // 同じ円盤の隣同士を結ぶ。芯の近くほど細かく分け、明るい部分の曲がりを保つ。
      const row = Math.floor(i / ANGULAR_COUNT)
      const column = i % ANGULAR_COUNT
      const r = DISK_RADIUS * (row / (rows - 1)) ** 1.35
      const a = (column / ANGULAR_COUNT) * TAU
      const p: V3 = [r * Math.cos(a), r * Math.sin(a), 0]
      material.set([p[0], p[1], galaxy, 0], (galaxy * half + i) * 4)
      if (row < rows - 1) {
        const start = galaxy * half + row * ANGULAR_COUNT
        const next = start + ANGULAR_COUNT
        const c = (column + 1) % ANGULAR_COUNT
        indices.push(
          start + column,
          next + column,
          start + c,
          start + c,
          next + column,
          next + c,
        )
      }
      // 個々の質量点の近傍の揺らぎを初速に写さず、半径ごとの平均の力で円運動を作る。
      const at = Math.min(255, (r / 3.6) * 256)
      const index = Math.floor(at)
      const speed =
        circularSpeed[index] +
        (circularSpeed[index + 1] - circularSpeed[index]) * (at - index)
      put(
        light,
        galaxy * half + i,
        galaxy,
        p,
        r === 0 ? [0, 0, 0] : [-speed * Math.sin(a), speed * Math.cos(a), 0],
        0,
        Math.min(1, r / 1.7),
      )
    }
  }
  // 同じ辺を持つ三角形を結び、局所的な伸びの中央値と比べる。
  const faceCount = indices.length / 3
  const neighbors = new Uint32Array(faceCount * 4)
  const edges = new Map<string, [number, number]>()
  for (let face = 0; face < faceCount; face++) {
    neighbors.fill(face, face * 4, face * 4 + 4)
    for (let edge = 0; edge < 3; edge++) {
      const a = indices[face * 3 + edge]
      const b = indices[face * 3 + ((edge + 1) % 3)]
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`
      const other = edges.get(key)
      if (other) {
        neighbors[face * 4 + edge] = other[0]
        neighbors[other[0] * 4 + other[1]] = face
      } else edges.set(key, [face, edge])
    }
  }
  return { mass, light, material, neighbors, indices: new Uint32Array(indices) }
}
