export type V3 = [number, number, number]
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
export const sub = (a: V3, b: V3): V3 => add(a, mul(b, -1))
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export const unit = (a: V3): V3 => mul(a, 1 / (Math.hypot(...a) || 1))
export const ROUND_SECONDS = 0.7
export const GROW_SECONDS = ROUND_SECONDS * 6
export const MAX_TREES = 12
export const STRIDE = 16
export const LEAF_WIDTH = 0.17
export const LEAF_DETAIL_PIXELS = 9
export const clamp = (x: number, lo = 0, hi = 1) =>
  Math.max(lo, Math.min(hi, x))
export const smooth = (x: number) => {
  const t = clamp(x)
  return t * t * (3 - 2 * t)
}
export interface TreeSettings {
  generations: number
  angle: number
  forks: number
}
export interface Branch {
  id: number
  parent: number
  generation: number
  a: V3
  b: V3
  c: V3
  d: V3
  length: number
}
interface Bud {
  parent: number
  heading: V3
  length: number
}
const mixSeed = (seed: number) => {
  seed = Math.imul(seed ^ (seed >>> 16), 0x21f0aaad)
  seed = Math.imul(seed ^ (seed >>> 15), 0x735a2d97)
  return (seed ^ (seed >>> 15)) >>> 0
}
export const random = (seed: number) => {
  // 連番の種でも木ごとの性質が相関しないよう、初期状態を混ぜる。
  seed = mixSeed(seed)
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}
export const curve = (b: Branch, t: number): V3 => {
  const u = 1 - t
  return add(
    add(mul(b.a, u ** 3), mul(b.b, 3 * u * u * t)),
    add(mul(b.c, 3 * u * t * t), mul(b.d, t ** 3)),
  )
}
const tangent = (b: Branch, t: number) =>
  unit(
    add(
      add(
        mul(sub(b.b, b.a), (1 - t) ** 2),
        mul(sub(b.c, b.b), 2 * t * (1 - t)),
      ),
      mul(sub(b.d, b.c), t * t),
    ),
  )

/** 新しく植える木だけが先の木を避ける。既存の木の中心線は計算し直さない。 */
export const lightDirection = (root: V3, neighbors: V3[]): V3 => {
  let away: V3 = [0, 0, 0]
  for (const other of neighbors) {
    const dx = root[0] - other[0]
    const dz = root[2] - other[2]
    const distance = Math.hypot(dx, dz)
    if (distance < 0.01 || distance > 3) continue
    const weight = (1 - distance / 3) ** 2
    away = add(away, [(dx / distance) * weight, 0, (dz / distance) * weight])
  }
  return Math.hypot(...away) > 0.001
    ? mul(unit(away), Math.min(0.22, Math.hypot(...away) * 0.2))
    : away
}

/** 形と葉の乱数を分け、世代を増やしても過去の枝の形を変えない。 */
export const treeTraits = (seed: number) => {
  const rng = random(seed ^ 0xa17c9e35)
  for (let i = 0; i < 8; i++) rng()
  const bearing = rng() * Math.PI * 2
  return {
    height: 0.7 + rng() * 0.6,
    thickness: 0.75 + rng() * 0.55,
    trunk: 0.68 + rng() * 0.8,
    spread: 0.65 + rng() * 0.85,
    shrink: 0.7 + rng() * 0.15,
    lean: [Math.cos(bearing) * 0.16, 0, Math.sin(bearing) * 0.16] as V3,
    bias: [Math.cos(bearing), 0, Math.sin(bearing)] as V3,
    dominance: rng() * 0.25,
    fullness: rng(),
    leafScale: 0.78 + rng() * 0.48,
    leafTone: [
      0.65 + rng() * 0.8,
      0.78 + rng() * 0.45,
      0.7 + rng() * 0.9,
    ] as V3,
    phase: rng() * Math.PI * 2,
  }
}

// 格子の乱数を滑らかに補間する低周波ノイズ。木の表面へ粒状の模様は加えない。
const noise = (x: number, phase: number) => {
  const cell = Math.floor(x)
  const sample = (at: number) =>
    mixSeed(at ^ Math.floor(phase * 1000000)) / 4294967296
  const blend = smooth(x - cell)
  return sample(cell) * (1 - blend) + sample(cell + 1) * blend - 0.5
}
const bendNoise = (p: V3, phase: number): V3 => [
  noise(p[1] * 1.3 + p[2] * 0.8, phase) * 0.2,
  0,
  noise(p[1] * 1.1 + p[0] * 0.9, phase + 7) * 0.2,
]

/** 一回の書き換えで、その時の X 全てを置換する。 */
export const growTree = (
  settings: TreeSettings,
  seed: number,
  root: V3 = [0, 0, 0],
  light: V3 = [0, 0, 0],
) => {
  const rng = random(seed)
  const traits = treeTraits(seed)
  const branches: Branch[] = []
  const rounds: { branches: number; buds: number }[] = []
  let buds: Bud[] = [
    {
      parent: -1,
      heading: unit(add([0, 1, 0], traits.lean)),
      length: 1.02 * traits.height * traits.trunk,
    },
  ]
  for (let generation = 1; generation <= settings.generations; generation++) {
    const next: Bud[] = []
    for (const bud of buds) {
      const parent = branches[bud.parent]
      const a: V3 = parent ? parent.d : [...root]
      const steering = add(
        add(
          add(bud.heading, mul(light, 0.65)),
          mul(traits.bias, traits.dominance * 0.2),
        ),
        add([0, 0.1, 0], bendNoise(sub(a, root), traits.phase)),
      )
      // 広い分岐角が重なっても枝を地面へ向けず、上への伸びを少し残す。
      const direction = unit([
        steering[0],
        Math.max(0.08, steering[1]),
        steering[2],
      ])
      const start = parent
        ? tangent(parent, 1)
        : unit(add([0, 1, 0], traits.lean))
      const length = bud.length
      const d = add(a, mul(direction, length))
      const bend = mul(
        bendNoise(
          add(sub(a, root), mul(direction, length * 0.5)),
          traits.phase,
        ),
        length,
      )
      const b = add(add(a, mul(start, length * 0.3)), bend)
      const c = add(sub(d, mul(direction, length * 0.3)), mul(bend, -0.65))
      const id = branches.length
      branches.push({ id, parent: bud.parent, generation, a, b, c, d, length })
      // 最初の分岐は残す。以降は頂芽の停止や一芽の継続も混ぜる。
      const chance = rng()
      const count =
        generation > 2 && chance < 0.12
          ? 0
          : generation > 1 && chance < 0.27
            ? 1
            : rng() < 0.24
              ? settings.forks === 2
                ? 3
                : 2
              : settings.forks
      const across = unit(
        cross(direction, Math.abs(direction[2]) < 0.85 ? [0, 0, 1] : [1, 0, 0]),
      )
      const side = cross(direction, across)
      const rotation = traits.phase + generation * 1.15 + (rng() - 0.5) * 1.4
      for (let i = 0; i < count; i++) {
        const azimuth =
          rotation + (i * Math.PI * 2) / count + (rng() - 0.5) * 0.6
        const turn =
          ((settings.angle * Math.PI) / 180) *
          traits.spread *
          (count === 1 ? 0.2 : 0.65 + rng() * 0.7)
        const lateral = add(
          mul(across, Math.cos(azimuth)),
          mul(side, Math.sin(azimuth)),
        )
        const heading = unit(
          add(
            add(mul(direction, Math.cos(turn)), mul(lateral, Math.sin(turn))),
            add([0, 0.08, 0], mul(traits.bias, traits.dominance)),
          ),
        )
        next.push({
          parent: id,
          heading,
          // 幹の長さと冠の大きさを独立させ、低い分岐も長い一本幹も出す。
          length:
            (parent ? length : 1.02 * traits.height) *
            traits.shrink *
            (0.8 + rng() * 0.36),
        })
      }
    }
    buds = next
    rounds.push({ branches: branches.length, buds: buds.length })
  }
  return { branches, buds, rounds, traits }
}

/** CPU と WGSL で共有する時間割。葉は枝が伸びきってから開く。 */
export const branchGrowth = (generation: number, age: number) => {
  const g = smooth((age - (generation - 1) * ROUND_SECONDS) / 0.52)
  return generation === 1 ? 0.32 + g * 0.68 : g
}
export const leafGrowth = (generation: number, age: number) =>
  smooth((age - ((generation - 1) * ROUND_SECONDS + 0.52)) / 0.18)

export const createTree = (
  settings: TreeSettings,
  seed: number,
  root: V3,
  light: V3,
) => {
  const model = growTree(settings, seed, root, light)
  const vertices: number[] = []
  const indices: number[] = []
  const rng = random(seed ^ 0x7193)
  // position / normal / UV・誕生時刻・材質 / 成長の起点 / 葉色。1 頂点 64 byte。
  const vertex = (
    p: V3,
    n: V3,
    u: number,
    v: number,
    birth: number,
    material: number,
    anchor: V3,
    tint: V3 = [1, 1, 1],
  ) => {
    vertices.push(...p, ...n, u, v, birth, material, ...anchor, ...tint)
  }
  const tube = (branch: Branch) => {
    const rings = 8
    const sides = 8
    const base = vertices.length / STRIDE
    const birth = (branch.generation - 1) * ROUND_SECONDS
    const radius =
      0.052 * model.traits.thickness * 0.67 ** (branch.generation - 1)
    for (let i = 0; i <= rings; i++) {
      const t = i / rings
      const center = curve(branch, t)
      const axis = tangent(branch, t)
      const across = unit(cross(axis, [0, 0, 1]))
      const side = cross(axis, across)
      const width = radius * (1 - t * 0.3)
      for (let j = 0; j < sides; j++) {
        const turn = (j / sides) * Math.PI * 2
        const normal = add(
          mul(across, Math.cos(turn)),
          mul(side, Math.sin(turn)),
        )
        vertex(
          add(center, mul(normal, width)),
          normal,
          j / sides,
          t,
          birth,
          0,
          branch.a,
        )
        if (i < rings) {
          const a = base + i * sides + j
          const b = base + i * sides + ((j + 1) % sides)
          indices.push(a, b, a + sides, b, b + sides, a + sides)
        }
      }
    }
    const cap = vertices.length / STRIDE
    vertex(branch.d, tangent(branch, 1), 0, 1, birth, 0, branch.a)
    for (let j = 0; j < sides; j++)
      indices.push(
        cap,
        base + rings * sides + j,
        base + rings * sides + ((j + 1) % sides),
      )
  }
  const blade = (
    anchor: V3,
    direction: V3,
    width: number,
    length: number,
    birth: number,
    tint: V3,
  ) => {
    const base = vertices.length / STRIDE
    const across = unit(cross(direction, [0.1, 1, 0.2]))
    const normal = unit(cross(across, direction))
    for (let i = 0; i <= 6; i++) {
      const t = i / 6
      const center = add(
        add(anchor, mul(direction, length * t)),
        mul(normal, Math.sin(t * Math.PI) * length * 0.12),
      )
      const bladeT = clamp((t - 1 / 6) / (5 / 6))
      const halfWidth =
        i <= 1 ? 0.006 : (Math.sin(Math.PI * bladeT) ** 0.85 * width) / 2
      for (const sign of [-1, 0, 1]) {
        const p = add(
          add(center, mul(across, halfWidth * sign)),
          mul(normal, -Math.abs(sign) * halfWidth * 0.18),
        )
        vertex(p, normal, sign, t, birth, 1, anchor, tint)
      }
      if (i < 6)
        for (let j = 0; j < 2; j++) {
          const a = base + i * 3 + j
          indices.push(a, a + 1, a + 3, a + 1, a + 4, a + 3)
        }
    }
  }
  const cluster = (branch: Branch, birth: number, tint: V3) => {
    // 内側を一続きの面にし、輪郭だけに葉先を残す。透過の粒や細かな穴を作らない。
    const base = vertices.length / STRIDE
    const normal = unit([0.12 + rng() * 0.3, 0.65, 0.65])
    const across = unit(cross(normal, [0, 1, 0]))
    const up = cross(normal, across)
    const radius =
      (0.26 + model.traits.fullness * 0.14 + rng() * 0.04) *
      model.traits.leafScale
    const center = add(branch.d, [0, radius * 0.35, 0])
    vertex(center, normal, 0, 0.5, birth, 2, branch.d, tint)
    const edges = 48
    for (let j = 0; j < edges; j++) {
      const turn = (j / edges) * Math.PI * 2
      const lobe = 0.85 + 0.15 * Math.cos(turn * 8)
      const x = Math.cos(turn) * radius * lobe
      const y = Math.sin(turn) * radius * lobe * 0.78
      const p = add(add(center, mul(across, x)), mul(up, y))
      vertex(p, normal, x / radius, y / radius, birth, 2, branch.d, tint)
      indices.push(base, base + 1 + j, base + 1 + ((j + 1) % edges))
    }
  }
  for (const branch of model.branches) {
    tube(branch)
    const birth = (branch.generation - 1) * ROUND_SECONDS + 0.52
    const tint = mul(model.traits.leafTone, 0.9 + rng() * 0.2)
    const leaves = 2 + Math.floor(model.traits.fullness * 3 + rng() * 2)
    for (let i = 0; i < leaves; i++) {
      const turn = (i * Math.PI * 2) / leaves + rng() * 0.45
      const direction = unit([
        Math.cos(turn),
        0.35 + rng() * 0.35,
        Math.sin(turn),
      ])
      // 葉柄も葉と同じ起点から開き、枝先から離れた葉を作らない。
      blade(
        branch.d,
        direction,
        LEAF_WIDTH * model.traits.leafScale,
        (0.38 + rng() * 0.14) * model.traits.leafScale,
        birth,
        mul(tint, 0.94 + rng() * 0.12),
      )
    }
    cluster(branch, birth, tint)
  }
  return {
    ...model,
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  }
}
