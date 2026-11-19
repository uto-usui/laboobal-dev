export interface Leaf {
  x: number
  pivot: number[]
  contact: number[]
  samples: number[][]
  obstacles: number[][]
  z: number
  phase: number
  stem: number
  length: number
  width: number
  rest: number[]
  angle: number[]
  velocity: number[]
  bend: number
  bendVelocity: number
  clearance?: number
  inertia: number
  stiffness: number
  shape: number[]
  color: number[]
}

// CPUの支点とWGSLの枝で同じ中心線を使う。波は木の生長の曲がりで、時間では動かさない。
export const branchY = (x: number) =>
  0.72 + x * 0.34 + 0.055 * Math.sin(x * 1.7) + 0.022 * Math.sin(x * 4.1)

export const BRANCH_TIP = -3.15
export const BRANCH_NECK = -2.93
export const BRANCH_ROOT = 6.4
export const BUD_SEGMENTS = 12
export const SHAFT_SEGMENTS = 100
export const BRANCH_SEGMENTS = BUD_SEGMENTS + SHAFT_SEGMENTS
export const BRANCH_SIDES = 10

// 芽と小枝は一本の管。短い芽にも十分な断面を割り当て、付け根の断面を共有する。
export const branchX = (segment: number) =>
  segment <= BUD_SEGMENTS
    ? BRANCH_TIP + ((BRANCH_NECK - BRANCH_TIP) * segment) / BUD_SEGMENTS
    : BRANCH_NECK +
      ((BRANCH_ROOT - BRANCH_NECK) * (segment - BUD_SEGMENTS)) / SHAFT_SEGMENTS

export const branchRadius = (x: number) => {
  if (x < BRANCH_NECK) {
    const t = Math.max(
      0,
      Math.min(1, (x - BRANCH_TIP) / (BRANCH_NECK - BRANCH_TIP)),
    )
    return 0.02 * t * t * (3 - 2 * t) + 0.033 * Math.sin(Math.PI * t) ** 2
  }
  const t = Math.max(
    0,
    Math.min(1, (x - BRANCH_NECK) / (BRANCH_ROOT - BRANCH_NECK)),
  )
  return 0.02 + 0.09 * t ** 1.25
}

// 一回の読み込み内では再設定やリサイズでも同じ枝を使う。
export const pageSeed = Math.random() * 0xffffffff
export const createLeaves = (
  narrow: boolean,
  seed = pageSeed,
  amount = 1,
): Leaf[] => {
  let state = seed >>> 0
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
  const vary = (range: number) => (random() * 2 - 1) * range * amount
  // 葉柄と隣の葉面の初期交差を静止角で外す。付け根の位置と葉の寸法は保つ。
  const specs = narrow
    ? [
        [-0.65, 0.2, 0.54, 1.62, 1.42, 2.12, 0.3, -0.05],
        [0.3, 0.5, 0.72, 1.95, 1.64, -0.38, -0.24, -0.12],
        [1.1, -0.45, 0.7, 1.6, 1.4, 2.75, 0.32, 0.18],
      ]
    : [
        [-1.15, 0.2, 0.65, 2.0, 1.75, 2.12, 0.3, -0.05],
        [0.3, 0.5, 0.85, 2.15, 1.9, -0.45, -0.24, -0.12],
        [3.25, -0.45, 0.95, 1.8, 1.6, -0.28, 0.32, 0.18],
        [-2.6, -0.18, 0.55, 1.6, 1.4, -0.42, -0.3, 0.08],
        [1.75, -0.3, 0.5, 1.55, 1.37, 2.25, 0.22, 0.075],
        [4.0, 0.3, 0.5, 1.3, 1.1, 2.0, 0.2, 0.1],
      ]
  // 線形RGB。見切れやすい六枚目は金にし、画面内の五枚に秋色を必ず配る。
  const colors = [
    [0.815, 0.485, 0.042],
    [0.25, 0.55, 0.035],
    [0.88, 0.12, 0.008],
    [0.23, 0.065, 0.016],
  ]
  const palette = narrow ? [0, 1, random() < 0.5 ? 2 : 3] : [0, 0, 1, 2, 3]
  for (let i = palette.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[palette[i], palette[j]] = [palette[j], palette[i]]
  }
  if (!narrow) palette.push(0)
  return specs
    .map<Leaf>(([x, z, stem, length, width, roll, yaw, pitch], i) => ({
      x: x + vary(0.12),
      pivot: [],
      contact: [],
      samples: [],
      obstacles: [],
      z: z + vary(0.1),
      phase: 3.1 + i * 7.3,
      stem: stem * (1 + vary(0.22)),
      length: length * (1 + vary(0.17)),
      width: width * (1 + vary(0.18)),
      shape: [
        0.68 + vary(0.16),
        0.3 + vary(0.12),
        (palette[i] === 1 ? 0.8 : palette[i] === 0 ? 0.22 : 0.08) +
          random() * 0.15,
        random(),
      ],
      rest: [pitch + vary(0.28), yaw + vary(0.48), roll + vary(0.32)],
      angle: [0, 0, 0],
      velocity: [0, 0, 0],
      bend: 0,
      bendVelocity: 0,
      inertia: 0.8 + i * 0.16,
      stiffness: [15, 11, 8.2, 16, 12, 13][i],
      color: colors[palette[i]].map((v) => v * (0.92 + random() * 0.16)),
    }))
    .map((leaf, _i, leaves) => {
      const basis = leafBasis(leaf, 0)
      const slope = branchSlope(leaf.x)
      const tangent = normalize([1, slope, 0])
      const outgoing = basis[1].map(
        (v, j) => -v * leaf.stem + basis[2][j] * leaf.z,
      )
      const normal = normalize(
        outgoing.map((v, j) => v - dot(outgoing, tangent) * tangent[j]),
      )
      const across = normalize([-slope, 1, 0])
      const angle =
        (Math.atan2(normal[2], dot(normal, across)) + Math.PI * 2) %
        (Math.PI * 2)
      // 描画する三角形の上で補間する。節と樹皮の凹凸も含む付け根を固定する。
      const ring = Math.min(
        BRANCH_SEGMENTS - 1,
        Math.max(
          0,
          BUD_SEGMENTS +
            Math.floor(
              ((leaf.x - BRANCH_NECK) / (BRANCH_ROOT - BRANCH_NECK)) *
                SHAFT_SEGMENTS,
            ),
        ),
      )
      const u = (angle / (Math.PI * 2)) * BRANCH_SIDES
      const side = Math.floor(u)
      const a = u - side
      const t = (leaf.x - branchX(ring)) / (branchX(ring + 1) - branchX(ring))
      const v00 = branchSurface(branchX(ring), side, leaves)
      const v10 = branchSurface(branchX(ring), side + 1, leaves)
      const v01 = branchSurface(branchX(ring + 1), side, leaves)
      const v11 = branchSurface(branchX(ring + 1), side + 1, leaves)
      leaf.pivot = v00.map((_, j) =>
        a + t <= 1
          ? v00[j] * (1 - a - t) + v10[j] * a + v01[j] * t
          : v11[j] * (a + t - 1) + v01[j] * (1 - a) + v10[j] * (1 - t),
      )
      leaf.contact = [...normal, 0]
      // 管の各区間は、両端の最大半径を持つカプセルの内側に必ず収まる。
      for (let r = 0; r < BRANCH_SEGMENTS; r++) {
        const x0 = branchX(r)
        const x1 = branchX(r + 1)
        const radii = [x0, x1].map((x) =>
          Math.max(
            ...Array.from({ length: BRANCH_SIDES }, (_, c) => {
              const p = branchSurface(x, c, leaves)
              return Math.hypot(p[0] - x, p[1] - branchY(x), p[2] + 0.12)
            }),
          ),
        )
        leaf.obstacles.push([
          x0,
          branchY(x0),
          x1 - x0,
          branchY(x1) - branchY(x0),
          Math.max(...radii),
        ])
      }
      const local = (column: number, row: number) => {
        const t = row / 72
        const s = (column / 24) * 2 - 1
        return [
          s *
            0.5 *
            Math.max(0, Math.sin(t * Math.PI)) ** leaf.shape[0] *
            (1.13 - leaf.shape[1] * t) *
            leaf.width *
            (1 + 0.008 * Math.sin(t * 191 + leaf.phase)),
          -leaf.stem - t * leaf.length,
          leaf.z +
            0.105 * s * s * Math.sin(t * Math.PI) +
            0.07 * t * t +
            0.025 * (1 - Math.abs(s)) * Math.sin(t * Math.PI) +
            0.022 * s * t,
          t * t,
        ]
      }
      // 外周と中央を通る12×4区画。区画内の全描画頂点を包むため、
      // 標本を減らしても三角形の内部と縁を取りこぼさない。
      for (let row = 0; row < 72; row += 6) {
        for (let column = 0; column < 24; column += 6) {
          const center = local(column + 3, row + 3)
          let radius = 0
          let bendRadius = 0
          const extent = [0, 0, 0]
          for (let r = row; r <= row + 6; r++) {
            for (let c = column; c <= column + 6; c++) {
              const p = local(c, r)
              for (let j = 0; j < 3; j++)
                extent[j] = Math.max(extent[j], Math.abs(p[j] - center[j]))
              radius = Math.max(
                radius,
                Math.hypot(...p.slice(0, 3).map((v, j) => v - center[j])),
              )
              bendRadius = Math.max(bendRadius, Math.abs(p[3] - center[3]))
            }
          }
          leaf.samples.push([...center, radius, bendRadius, ...extent])
        }
      }
      return leaf
    })
}

export interface Gust {
  at: number
  direction: number
  strength: number
  from?: number
}

export interface Settings {
  wind: number
  damping: number
  automatic: boolean
  light: number
}

export const windAt = (gust: Gust, time: number, x: number) => {
  // 同じ帯が葉を順に通る。葉どうしで力を受け渡すモデルではない。
  const front = (gust.from ?? -5.5) + (time - gust.at) * 5
  const distance = x * gust.direction - front
  return gust.direction * gust.strength * Math.exp((-distance * distance) / 0.7)
}

export const integrateLeaf = (
  leaf: Leaf,
  wind: number,
  dt: number,
  settings: Settings,
) => {
  const [pitch, yaw, roll] = leaf.angle
  // 面の向きと葉面に対する風の相対速度から、葉柄にかかるトルクを近似する。
  const relative = wind - leaf.velocity[1] * 0.13
  const incidence = 0.32 + 0.68 * Math.abs(Math.cos(leaf.rest[1] + yaw))
  const pressure = relative * Math.abs(relative) * incidence
  // 圧力中心を葉身の根元から45%の位置とし、支点までの距離でトルクに直す。
  const torqueScale = (pressure * (leaf.stem + leaf.length * 0.45)) / 1.4
  const forces = [torqueScale * 0.28, torqueScale * 4.2, torqueScale * 0.45]
  for (let axis = 0; axis < 3; axis++) {
    const a = leaf.angle[axis]
    const k = leaf.stiffness * [1.3, 0.72, 1][axis]
    // 重心が支点より下にあるため、傾きには重力の復元も加える。
    const gravity = axis === 1 ? 0 : 2.3 * Math.sin(a)
    // 葉柄そのものの可動域もばねで保ち、長い風で何周も回るのを避ける。
    const limit = axis === 1 ? 1.65 : 0.9
    const excess = Math.max(0, Math.abs(a) - limit)
    const stop =
      Math.sign(a) *
      (320 * excess +
        (excess > 0 ? 10 * Math.max(0, Math.sign(a) * leaf.velocity[axis]) : 0))
    const torque =
      forces[axis] -
      k * a -
      gravity -
      settings.damping * leaf.velocity[axis] -
      stop
    // 接触勾配が小さい姿勢でも、次の一歩で葉柄を何回転もさせない。
    leaf.velocity[axis] = Math.max(
      -8,
      Math.min(8, leaf.velocity[axis] + (torque / leaf.inertia) * dt),
    )
    leaf.angle[axis] += leaf.velocity[axis] * dt
  }
  const target = pressure * 0.014 + (pitch - roll) * 0.035
  leaf.bendVelocity +=
    ((target - leaf.bend) * 32 - 5.5 * leaf.bendVelocity) * dt
  leaf.bendVelocity = Math.max(-2, Math.min(2, leaf.bendVelocity))
  leaf.bend += leaf.bendVelocity * dt
}

/** 列の順。葉と葉柄が同じ支点・姿勢を使い、根元が離れないようにする。 */
export const leafBasis = (leaf: Leaf, branch: number) => {
  const [p, y, r] = leaf.rest.map((a, i) => a + leaf.angle[i])
  const cp = Math.cos(p)
  const sp = Math.sin(p)
  const cy = Math.cos(y)
  const sy = Math.sin(y)
  const cr = Math.cos(r + branch)
  const sr = Math.sin(r + branch)
  return [
    [cr * cy, sr * cy, -sy],
    [cr * sy * sp - sr * cp, sr * sy * sp + cr * cp, cy * sp],
    [cr * sy * cp + sr * sp, sr * sy * cp - cr * sp, cy * cp],
  ]
}

export const branchPoint = (x: number, angle: number, z = 0, side = 0) => {
  const dx = x - 5.6
  const dy = branchY(x) + side * branchRadius(x) * 0.8 - branchY(5.6)
  return [
    5.6 + dx * Math.cos(angle) - dy * Math.sin(angle),
    branchY(5.6) + dx * Math.sin(angle) + dy * Math.cos(angle),
    z,
  ]
}

export const dot = (a: number[], b: number[]) =>
  a.reduce((sum, v, i) => sum + v * b[i], 0)
export const normalize = (v: number[]) => v.map((x) => x / Math.hypot(...v))
export const branchSlope = (x: number) =>
  0.34 + 0.0935 * Math.cos(x * 1.7) + 0.0902 * Math.cos(x * 4.1)

export const branchSurface = (x: number, side: number, leaves: Leaf[]) => {
  const a = ((side % BRANCH_SIDES) / BRANCH_SIDES) * Math.PI * 2
  const across = normalize([-branchSlope(x), 1, 0])
  const radius =
    branchRadius(x) *
    leaves.reduce(
      (r, leaf) => r * (1 + 0.28 * Math.exp(-(((x - leaf.x) / 0.09) ** 2))),
      1,
    ) *
    (1 + 0.045 * Math.sin(x * 27 + a * 3))
  return [
    x + radius * across[0] * Math.cos(a),
    branchY(x) + radius * across[1] * Math.cos(a),
    -0.12 + radius * Math.sin(a),
  ]
}

interface BranchNode {
  lo: number[]
  hi: number[]
  radius: number
  children?: BranchNode[]
  obstacle?: number[]
}
const branches = new WeakMap<Leaf, BranchNode>()
const branchTree = (leaf: Leaf) => {
  const cached = branches.get(leaf)
  if (cached) return cached
  const build = (items: number[][]): BranchNode => {
    const lo = [Infinity, Infinity, -0.12],
      hi = [-Infinity, -Infinity, -0.12]
    let radius = 0
    for (const [x, y, dx, dy, r] of items) {
      lo[0] = Math.min(lo[0], x, x + dx)
      lo[1] = Math.min(lo[1], y, y + dy)
      hi[0] = Math.max(hi[0], x, x + dx)
      hi[1] = Math.max(hi[1], y, y + dy)
      radius = Math.max(radius, r)
    }
    return {
      lo,
      hi,
      radius,
      ...(items.length === 1
        ? { obstacle: items[0] }
        : {
            children: [
              build(items.slice(0, items.length >> 1)),
              build(items.slice(items.length >> 1)),
            ],
          }),
    }
  }
  const root = build(leaf.obstacles)
  branches.set(leaf, root)
  return root
}

/** 描画頂点を包む区画と小枝のカプセルの距離下限。遠い小枝は木でまとめて外す。 */
const clearanceCache = new WeakMap<Leaf, Map<string, number>>()
export const leafClearance = (leaf: Leaf) => {
  let cache = clearanceCache.get(leaf)
  if (!cache) {
    cache = new Map()
    clearanceCache.set(leaf, cache)
  }
  const key = [...leaf.angle, leaf.bend].join(',')
  const saved = cache.get(key)
  if (saved !== undefined) return saved
  const result = computeClearance(leaf)
  if (cache.size >= 32) cache.clear()
  cache.set(key, result)
  return result
}
const computeClearance = (leaf: Leaf) => {
  const basis = leafBasis(leaf, 0),
    root = branchTree(leaf)
  const transformed = new Map<BranchNode, number[]>()
  const localBox = (node: BranchNode) => {
    const saved = transformed.get(node)
    if (saved) return saved
    const cx = (node.lo[0] + node.hi[0]) / 2 - leaf.pivot[0],
      cy = (node.lo[1] + node.hi[1]) / 2 - leaf.pivot[1],
      cz = -0.12 - leaf.pivot[2],
      ex = (node.hi[0] - node.lo[0]) / 2,
      ey = (node.hi[1] - node.lo[1]) / 2
    const box = []
    for (const axis of basis) {
      const c = axis[0] * cx + axis[1] * cy + axis[2] * cz,
        e = Math.abs(axis[0]) * ex + Math.abs(axis[1]) * ey
      box.push(c - e, c + e)
    }
    if (node.obstacle) {
      // 末端では区間の両端を直接写し、途中の箱の膨らみを取り除く。
      const [x, y, dx, dy] = node.obstacle
      for (let j = 0; j < 3; j++) {
        const axis = basis[j],
          a =
            axis[0] * (x - leaf.pivot[0]) +
            axis[1] * (y - leaf.pivot[1]) +
            axis[2] * cz,
          b = a + axis[0] * dx + axis[1] * dy
        box[2 * j] = Math.min(a, b)
        box[2 * j + 1] = Math.max(a, b)
      }
    }
    transformed.set(node, box)
    return box
  }
  let closest = 0.2
  for (const p of leaf.samples) {
    const z = p[2] + leaf.bend * p[3]
    const x =
      leaf.pivot[0] + basis[0][0] * p[0] + basis[1][0] * p[1] + basis[2][0] * z
    const y =
      leaf.pivot[1] + basis[0][1] * p[0] + basis[1][1] * p[1] + basis[2][1] * z
    const depth =
      leaf.pivot[2] +
      basis[0][2] * p[0] +
      basis[1][2] * p[1] +
      basis[2][2] * z +
      0.12
    const radius = p[4] + Math.abs(leaf.bend) * p[5]
    // 中心線全体は直線から0.077以内。遠い葉面では区間ごとの探索を省く。
    const lower =
      Math.hypot((y - 0.72 - x * 0.34) / Math.hypot(1, 0.34), depth) -
      0.077 -
      0.15 -
      radius
    if (lower >= Math.min(closest, 0.2)) continue
    const extentZ = p[8] + Math.abs(leaf.bend) * p[5]
    const visit = (node: BranchNode) => {
      const o = localBox(node),
        reach = closest + node.radius
      if (reach <= 0) return
      const gx = Math.max(0, o[0] - p[0] - p[6], p[0] - p[6] - o[1])
      if (gx >= reach) return
      const gy = Math.max(0, o[2] - p[1] - p[7], p[1] - p[7] - o[3])
      if (gy >= reach) return
      const gz = Math.max(0, o[4] - z - extentZ, z - extentZ - o[5])
      const squared = gx * gx + gy * gy + gz * gz
      if (squared >= reach * reach) return
      if (node.children) {
        for (const child of node.children) visit(child)
      } else closest = Math.sqrt(squared) - node.radius
    }
    visit(root)
  }
  const controls = stemControls(leaf, basis)
  // 根元の短い接合部では二本の管を重ねて継ぐ。それ以外は曲線の制御点ごと包む。
  for (let row = 4; row < 24; row++) {
    const t0 = row / 24
    const t1 = (row + 1) / 24
    const p0 = stemPoint(controls, t0)
    const p3 = stemPoint(controls, t1)
    const d0 = stemDerivative(controls, t0),
      d1 = stemDerivative(controls, t1)
    const p1 = p0.map((v, j) => v + d0[j] / 72)
    const p2 = p3.map((v, j) => v - d1[j] / 72)
    const center = p0.map((v, j) => (v + p3[j]) / 2)
    const radius =
      Math.max(
        ...[p0, p1, p2, p3].map((p) =>
          Math.hypot(...p.map((v, j) => v - center[j])),
        ),
      ) + 0.014
    const world = center.map((v, j) => v + leaf.pivot[j])
    const visit = (node: BranchNode) => {
      const reach = closest + radius + node.radius - 0.013
      if (reach <= 0) return
      let squared = 0
      for (let j = 0; j < 3; j++) {
        const d = Math.max(0, node.lo[j] - world[j], world[j] - node.hi[j])
        squared += d * d
      }
      if (squared >= reach * reach) return
      if (node.children) {
        for (const child of node.children) visit(child)
        return
      }
      const [ox, oy, dx, dy, r] = node.obstacle!,
        px = world[0] - ox,
        py = world[1] - oy
      const t = Math.max(
        0,
        Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)),
      )
      closest = Math.min(
        closest,
        Math.hypot(px - t * dx, py - t * dy, world[2] + 0.12) -
          r -
          radius +
          0.013,
      )
    }
    visit(root)
  }
  return Math.min(closest, 0.2)
}

const branchGradients = new WeakMap<
  Leaf,
  { pose: number[]; gradient: number[] }
>()
export const resolveContact = (leaf: Leaf, previous: number[]) => {
  const proposedPose = [...leaf.angle, leaf.bend]
  const poseAt = (t: number) => {
    leaf.angle = previous
      .slice(0, 3)
      .map((v, i) => v + (proposedPose[i] - v) * t)
    leaf.bend = previous[3] + (proposedPose[3] - previous[3]) * t
  }
  // 両端が安全でも途中で細い枝を飛び越すことがある。回転とたわみから
  // 葉面の移動距離の上限を求め、余白で保証できない区間だけ細かく調べる。
  const radius = Math.hypot(
    leaf.width,
    leaf.stem + leaf.length,
    Math.abs(leaf.z) +
      0.4 +
      Math.max(Math.abs(previous[3]), Math.abs(leaf.bend)),
  )
  const travel =
    radius *
      leaf.angle.reduce((sum, a, i) => sum + Math.abs(a - previous[i]), 0) +
    2 * Math.abs(leaf.bend - previous[3])
  let clearance = leafClearance(leaf)
  let startGap = leaf.clearance
  if (startGap === undefined) {
    poseAt(0)
    startGap = leafClearance(leaf)
  }
  const sweep = (
    a: number,
    ga: number,
    b: number,
    gb: number,
    depth: number,
  ): number => {
    if (ga >= 0.016 && gb >= 0.016 && ga + gb - travel * (b - a) >= 0.032)
      return b
    if (depth === 0) return a
    const mid = (a + b) / 2
    poseAt(mid)
    const gm = leafClearance(leaf)
    const left = sweep(a, ga, mid, gm, depth - 1)
    if (left < mid) return left
    return sweep(mid, gm, b, gb, depth - 1)
  }
  const fraction = sweep(0, startGap, 1, clearance, 2)
  poseAt(fraction)
  if (fraction < 1) clearance = leafClearance(leaf)
  leaf.clearance = clearance
  if (fraction === 1) return
  const current = [...leaf.angle, leaf.bend]
  const cached = branchGradients.get(leaf)
  let gradient: number[]
  // 勾配の再利用は力と速度の補正だけ。安全の判定には毎回の掃引を使う。
  if (cached && current.every((v, j) => Math.abs(v - cached.pose[j]) < 0.04))
    gradient = cached.gradient
  else {
    gradient = leaf.angle.map((a, axis) => {
      leaf.angle[axis] = a + 0.0001
      const delta = (leafClearance(leaf) - clearance) / 0.0001
      leaf.angle[axis] = a
      return delta
    })
    leaf.bend += 0.0001
    gradient.push((leafClearance(leaf) - clearance) / 0.0001)
    leaf.bend -= 0.0001
    branchGradients.set(leaf, { pose: current, gradient })
  }
  const speed = dot(gradient, [...leaf.velocity, leaf.bendVelocity])
  const norm = Math.max(dot(gradient, gradient), 0.000001)
  // 接触は接近速度だけを除く。距離の下限が切り替わる場所で、
  // 反発ばねが静止中の葉へ繰り返しエネルギーを加えることを避ける。
  if (speed < 0) {
    for (let axis = 0; axis < 3; axis++)
      leaf.velocity[axis] -= (speed * gradient[axis]) / norm
    leaf.bendVelocity -= (speed * gradient[3]) / norm
  }
}

export const leafPivot = (leaf: Leaf, angle: number) => {
  const center = branchPoint(leaf.pivot[0], angle, leaf.pivot[2])
  const dy = leaf.pivot[1] - branchY(leaf.pivot[0])
  return [
    center[0] - Math.sin(angle) * dy,
    center[1] + Math.cos(angle) * dy,
    center[2],
  ]
}

export const stemControls = (leaf: Leaf, basis = leafBasis(leaf, 0)) => {
  const end = basis[1].map((v, j) => -v * leaf.stem + basis[2][j] * leaf.z)
  const first = leaf.contact.slice(0, 3).map((v) => v * leaf.stem * 0.35)
  const side = Math.cos(leaf.rest[2]) < 0 ? 1 : -1
  const second = end.map(
    (v, j) => v * 0.72 + basis[0][j] * leaf.stem * 0.13 * side,
  )
  const correction = Math.max(0, 0.08 - dot(second, leaf.contact.slice(0, 3)))
  return [
    [0, 0, 0],
    first,
    second.map((v, j) => v + leaf.contact[j] * correction),
    end,
  ]
}
export const stemPoint = (p: number[][], t: number) =>
  p[0].map(
    (_, j) =>
      p[0][j] * (1 - t) ** 3 +
      3 * p[1][j] * (1 - t) ** 2 * t +
      3 * p[2][j] * (1 - t) * t * t +
      p[3][j] * t ** 3,
  )
const stemDerivative = (p: number[][], t: number) =>
  p[0].map(
    (_, j) =>
      3 * (p[1][j] - p[0][j]) * (1 - t) ** 2 +
      6 * (p[2][j] - p[1][j]) * (1 - t) * t +
      3 * (p[3][j] - p[2][j]) * t * t,
  )
