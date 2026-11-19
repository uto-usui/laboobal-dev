import { hullContact, hullSweepSafe, type Hull } from './convex.ts'
import { type Leaf, leafBasis, stemControls, stemPoint } from './simulation.ts'

export type Vec = number[]
export const add = (a: Vec, b: Vec) => a.map((v, i) => v + b[i])
export const sub = (a: Vec, b: Vec) => a.map((v, i) => v - b[i])
export const scale = (a: Vec, s: number) => a.map((v) => v * s)
export const dot3 = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec, b: Vec) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const clamp = (t: number) => Math.max(0, Math.min(1, t))
const mix = (a: Vec, b: Vec, t: number) => add(a, scale(sub(b, a), t))
export const magnitude = (a: Vec) => Math.sqrt(dot3(a, a))

// xyzは静止時の葉座標、wはたわみの係数。WGSL leafLocal と同じ頂点を使う。
export const localPoint = (leaf: Leaf, column: number, row: number): Vec => {
  const t = row / 72,
    s = (column / 24) * 2 - 1
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

export interface Witness {
  local?: Vec
  stem?: Vec
}
export const witnessPoint = (leaf: Leaf, point: Witness): Vec => {
  const basis = leafBasis(leaf, 0)
  if (point.stem !== undefined) {
    const controls = stemControls(leaf, basis)
    return add(
      leaf.pivot,
      controls[0].map((_, j) =>
        controls.reduce((sum, p, i) => sum + p[j] * point.stem![i], 0),
      ),
    )
  }
  const p = point.local!
  return leaf.pivot.map(
    (v, j) =>
      v +
      basis[0][j] * p[0] +
      basis[1][j] * p[1] +
      basis[2][j] * (p[2] + leaf.bend * p[3]),
  )
}
interface Vertex {
  world: Vec
  witness: Witness
}
interface Primitive {
  vertices: Vertex[]
  radius: number
}
interface Node {
  joint?: boolean
  obb?: { center: Vec; basis: Vec[]; extent: Vec }
  lo: Vec
  hi: Vec
  children?: Node[]
  expand?: () => Node[]
  primitive?: Primitive
}
interface LocalNode {
  lo: Vec
  hi: Vec
  children?: LocalNode[]
  triangles?: number[][]
  error: number
  bendError: number
}
interface Mesh {
  points: Vec[]
  root: LocalNode
  hullVertices: Vertex[]
}
const meshes = [new WeakMap<Leaf, Mesh>(), new WeakMap<Leaf, Mesh>()]
const localMesh = (leaf: Leaf, detailed: boolean): Mesh => {
  const store = meshes[detailed ? 1 : 0]
  const cached = store.get(leaf)
  if (cached) return cached
  const points = Array.from({ length: 73 * 25 }, (_, i) =>
    localPoint(leaf, i % 25, Math.floor(i / 25)),
  )
  const build = (c0: number, c1: number, r0: number, r1: number): LocalNode => {
    const lo = [Infinity, Infinity, Infinity, Infinity],
      hi = lo.map(() => -Infinity)
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const p = points[r * 25 + c]
        for (let j = 0; j < 4; j++) {
          lo[j] = Math.min(lo[j], p[j])
          hi[j] = Math.max(hi[j], p[j])
        }
      }
    if (
      (c1 - c0 <= 12 && r1 - r0 <= 12 && !detailed) ||
      (c1 - c0 === 1 && r1 - r0 === 1)
    ) {
      const a = r0 * 25 + c0,
        b = r1 * 25 + c0
      const triangles = [
        [a, b, r0 * 25 + c1],
        [r0 * 25 + c1, b, r1 * 25 + c1],
      ]
      let error = 0,
        bendError = 0
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const u = (c - c0) / (c1 - c0),
            v = (r - r0) / (r1 - r0)
          const tri = triangles[u + v <= 1 ? 0 : 1]
          const w = u + v <= 1 ? [1 - u - v, v, u] : [1 - v, 1 - u, u + v - 1]
          const delta = points[r * 25 + c].map(
            (x, j) =>
              x - tri.reduce((sum, k, i) => sum + points[k][j] * w[i], 0),
          )
          error = Math.max(error, Math.hypot(delta[0], delta[1], delta[2]))
          bendError = Math.max(bendError, Math.abs(delta[3]))
        }
      return { lo, hi, triangles, error, bendError }
    }
    // 葉面を包む区画から描画三角形まで降り、遠い部分をまとめて外す。
    const splitRows = (r1 - r0) / (c1 - c0) > 3 || c1 - c0 === 1
    const mid =
      splitRows && r0 === 0 && r1 > 2
        ? 2
        : Math.floor(splitRows ? (r0 + r1) / 2 : (c0 + c1) / 2)
    const children = splitRows
      ? [build(c0, c1, r0, mid), build(c0, c1, mid, r1)]
      : [build(c0, mid, r0, r1), build(mid, c1, r0, r1)]
    return {
      lo,
      hi,
      children,
      error: Math.max(...children.map((n) => n.error)),
      bendError: Math.max(...children.map((n) => n.bendError)),
    }
  }
  const root = build(0, 24, 0, 72),
    indices = new Set<number>()
  const collect = (n: LocalNode) => {
    if (n.children) n.children.forEach(collect)
    else for (const tri of n.triangles!) for (const i of tri) indices.add(i)
  }
  collect(root)
  const mesh = {
    points,
    root,
    hullVertices: [...indices].map((i) => ({
      world: points[i],
      witness: { local: points[i] },
    })),
  }
  store.set(leaf, mesh)
  return mesh
}
const bounds = (vertices: Vertex[], radius: number): Node => ({
  lo: [0, 1, 2].map(
    (j) => Math.min(...vertices.map((p) => p.world[j])) - radius,
  ),
  hi: [0, 1, 2].map(
    (j) => Math.max(...vertices.map((p) => p.world[j])) + radius,
  ),
  primitive: { vertices, radius },
})
const union = (children: Node[]): Node => ({
  children,
  joint: children.every((n) => n.joint),
  lo: [0, 1, 2].map((j) => Math.min(...children.map((n) => n.lo[j]))),
  hi: [0, 1, 2].map((j) => Math.max(...children.map((n) => n.hi[j]))),
})
const childrenOf = (node: Node) => (node.children ??= node.expand!())
export const boxGap = (a: Node, b: Node) => {
  const x = Math.max(0, a.lo[0] - b.hi[0], b.lo[0] - a.hi[0]),
    y = Math.max(0, a.lo[1] - b.hi[1], b.lo[1] - a.hi[1]),
    z = Math.max(0, a.lo[2] - b.hi[2], b.lo[2] - a.hi[2])
  return Math.sqrt(x * x + y * y + z * z)
}

// 回転した葉の箱を世界軸の箱だけに広げると、斜めに並ぶ遠い面まで探索する。
// 元の箱の軸でも分離を調べる。射影幅は包絡箱から求める安全側の値。
const projectedCenter = (n: Node, axis: Vec) =>
  n.obb
    ? dot3(n.obb.center, axis)
    : ((n.lo[0] + n.hi[0]) * axis[0] +
        (n.lo[1] + n.hi[1]) * axis[1] +
        (n.lo[2] + n.hi[2]) * axis[2]) /
      2
const projectedRadius = (n: Node, axis: Vec) =>
  n.obb
    ? Math.abs(dot3(n.obb.basis[0], axis)) * n.obb.extent[0] +
      Math.abs(dot3(n.obb.basis[1], axis)) * n.obb.extent[1] +
      Math.abs(dot3(n.obb.basis[2], axis)) * n.obb.extent[2]
    : ((n.hi[0] - n.lo[0]) * Math.abs(axis[0]) +
        (n.hi[1] - n.lo[1]) * Math.abs(axis[1]) +
        (n.hi[2] - n.lo[2]) * Math.abs(axis[2])) /
      2
const boxSeparated = (a: Node, b: Node, margin: number, a1 = a, b1 = b) => {
  for (let side = 0; side < 2; side++) {
    const basis = (side === 0 ? a : b).obb?.basis
    if (!basis) continue
    for (const axis of basis) {
      const x = projectedCenter(a, axis),
        xr = projectedRadius(a, axis),
        y = projectedCenter(b, axis),
        yr = projectedRadius(b, axis),
        u = projectedCenter(a1, axis),
        ur = projectedRadius(a1, axis),
        v = projectedCenter(b1, axis),
        vr = projectedRadius(b1, axis)
      if (
        Math.max(
          Math.min(x - xr, u - ur) - Math.max(y + yr, v + vr),
          Math.min(y - yr, v - vr) - Math.max(x + xr, u + ur),
        ) >= margin
      )
        return true
    }
  }
  return false
}

export interface Shape {
  surfaceHull: Hull
  stemHull: Hull
  detailed: boolean
  selfGap: number
  surface: Node
  stem: Node
  leaf: Leaf
}
const shapes = [
  new WeakMap<Leaf, { key: string; shape: Shape }>(),
  new WeakMap<Leaf, { key: string; shape: Shape }>(),
]
export const contactShape = (leaf: Leaf, detailed = false): Shape => {
  const store = shapes[detailed ? 1 : 0]
  const key = [...leaf.angle, leaf.bend].join(',')
  const saved = store.get(leaf)
  if (saved?.key === key) return saved.shape
  const mesh = localMesh(leaf, detailed),
    basis = leafBasis(leaf, 0),
    bend = leaf.bend,
    cache = new Map<LocalNode, Node>(),
    vertices = new Map<number, Vertex>()
  const vertex = (i: number): Vertex => {
    let p = vertices.get(i)
    if (!p) {
      const local = mesh.points[i]
      p = {
        witness: { local },
        world: leaf.pivot.map(
          (v, j) =>
            v +
            basis[0][j] * local[0] +
            basis[1][j] * local[1] +
            basis[2][j] * (local[2] + bend * local[3]),
        ),
      }
      vertices.set(i, p)
    }
    return p
  }
  const node = (local: LocalNode): Node => {
    const cached = cache.get(local)
    if (cached) return cached
    const lo = local.lo.slice(0, 3),
      hi = local.hi.slice(0, 3)
    lo[2] += bend * (bend < 0 ? local.hi[3] : local.lo[3])
    hi[2] += bend * (bend < 0 ? local.lo[3] : local.hi[3])
    const padding = local.error + Math.abs(bend) * local.bendError
    const center = lo.map((v, j) => (v + hi[j]) / 2),
      extent = lo.map((v, j) => (hi[j] - v) / 2 + padding)
    const world = leaf.pivot.map(
      (v, j) =>
        v +
        basis[0][j] * center[0] +
        basis[1][j] * center[1] +
        basis[2][j] * center[2],
    )
    const size = [0, 1, 2].map(
      (j) =>
        Math.abs(basis[0][j]) * extent[0] +
        Math.abs(basis[1][j]) * extent[1] +
        Math.abs(basis[2][j]) * extent[2],
    )
    const result: Node = {
      obb: { center: world, basis, extent },
      lo: sub(world, size),
      hi: add(world, size),
      joint: (-local.lo[1] - leaf.stem) / leaf.length <= 2 / 72 + 1e-8,
    }
    result.expand = () =>
      local.children
        ? local.children.map(node)
        : local.triangles!.map((tri) => ({
            ...bounds(tri.map(vertex), padding),
            joint: result.joint,
          }))
    cache.set(local, result)
    return result
  }
  const controls = stemControls(leaf, basis)
  // 葉柄全体は制御点の凸包で先に外す。24区間のカプセルは必要なときだけ作る。
  const stemRoot = bounds(
    controls.map((p) => ({ world: add(leaf.pivot, p), witness: {} })),
    0.014,
  )
  delete stemRoot.primitive
  let stemChildren: Node[] | undefined
  stemRoot.expand = () => {
    if (stemChildren) return stemChildren
    const stemVertices = Array.from({ length: 25 }, (_, i) => ({
      world: add(leaf.pivot, stemPoint(controls, i / 24)),
      witness: {
        stem: [
          (1 - i / 24) ** 3,
          3 * (1 - i / 24) ** 2 * (i / 24),
          3 * (1 - i / 24) * (i / 24) ** 2,
          (i / 24) ** 3,
        ],
      },
    }))
    const stems: Node[] = []
    // 制御点の凸包から弦とのずれを足し、曲線全体と管の断面を包む。
    for (let i = 0; i < 24; i++) {
      const a = i / 24,
        b = (i + 1) / 24
      const p = stemVertices[i],
        q = stemVertices[i + 1]
      const derivative = (t: number) =>
        controls[0].map(
          (_, j) =>
            3 * (controls[1][j] - controls[0][j]) * (1 - t) ** 2 +
            6 * (controls[2][j] - controls[1][j]) * (1 - t) * t +
            3 * (controls[3][j] - controls[2][j]) * t * t,
        )
      const u = add(p.world, scale(derivative(a), 1 / 72)),
        v = sub(q.world, scale(derivative(b), 1 / 72))
      const deviation = Math.max(
        magnitude(sub(u, mix(p.world, q.world, 1 / 3))),
        magnitude(sub(v, mix(p.world, q.world, 2 / 3))),
      )
      stems.push({
        ...bounds([p, q], 0.014 - 0.006 * a + deviation),
        joint: i >= 22,
      })
    }
    const tree = (nodes: Node[]): Node =>
      nodes.length === 1
        ? nodes[0]
        : union([
            tree(nodes.slice(0, Math.floor(nodes.length / 2))),
            tree(nodes.slice(Math.floor(nodes.length / 2))),
          ])
    stemChildren = [tree(stems)]
    return stemChildren
  }
  const ys = controls.map((p) => dot3(p, basis[1]))
  const yAt = (t: number) =>
    ys[0] * (1 - t) ** 3 +
    3 * ys[1] * t * (1 - t) ** 2 +
    3 * ys[2] * t * t * (1 - t) +
    ys[3] * t ** 3
  const yMin = (a: number, b: number) => {
    let minimum = Math.min(yAt(a), yAt(b))
    const c = ys[1] - ys[0],
      d = 2 * (ys[2] - 2 * ys[1] + ys[0]),
      e = ys[3] - 3 * ys[2] + 3 * ys[1] - ys[0]
    const roots =
      Math.abs(e) < 1e-12
        ? Math.abs(d) > 1e-12
          ? [-c / d]
          : []
        : d * d - 4 * e * c >= 0
          ? [
              (-d - Math.sqrt(d * d - 4 * e * c)) / (2 * e),
              (-d + Math.sqrt(d * d - 4 * e * c)) / (2 * e),
            ]
          : []
    for (const t of roots)
      if (t > a && t < b) minimum = Math.min(minimum, yAt(t))
    return minimum
  }
  const curvature = Math.max(
    ...[0, 1].map((i) =>
      magnitude(
        controls[i].map(
          (v, j) => 6 * (v - 2 * controls[i + 1][j] + controls[i + 2][j]),
        ),
      ),
    ),
  )
  const radius = 0.014 + curvature / (3 * 24 * 24)
  const selfGap = Math.min(
    yMin(0, 22 / 24) + leaf.stem - radius,
    yMin(22 / 24, 1) + leaf.stem + (leaf.length * 2) / 72 - radius,
  )

  const shape: Shape = {
    surfaceHull: {
      key: mesh.root,
      points: mesh.hullVertices,
      transform: { basis, pivot: leaf.pivot, bend },
      radius: mesh.root.error + Math.abs(bend) * mesh.root.bendError,
    },
    stemHull: {
      key: leaf,
      points: controls.map((p, i) => ({
        world: add(leaf.pivot, p),
        witness: { stem: [0, 1, 2, 3].map((j) => (j === i ? 1 : 0)) },
      })),
      radius: 0.014,
    },
    detailed,
    surface: node(mesh.root),
    stem: stemRoot,
    leaf,
    selfGap,
  }
  store.set(leaf, { key, shape })
  return shape
}

export interface Closest {
  a: Vec
  b: Vec
  wa: Vec
  wb: Vec
  distance: number
}
const result = (a: Vec, b: Vec, wa: Vec, wb: Vec): Closest => ({
  a,
  b,
  wa,
  wb,
  distance: magnitude(sub(a, b)),
})
// 線分同士の最近点。平行と長さ0も処理する。
export const segmentClosest = (a: Vec, b: Vec, c: Vec, d: Vec): Closest => {
  const u = sub(b, a),
    v = sub(d, c),
    w = sub(a, c),
    aa = dot3(u, u),
    bb = dot3(u, v),
    cc = dot3(v, v),
    dd = dot3(u, w),
    ee = dot3(v, w)
  let s =
    aa > 1e-20 ? clamp((bb * ee - cc * dd) / (aa * cc - bb * bb || 1e-30)) : 0
  let t = cc > 1e-20 ? (bb * s + ee) / cc : 0
  if (t < 0) {
    t = 0
    s = aa > 1e-20 ? clamp(-dd / aa) : 0
  } else if (t > 1) {
    t = 1
    s = aa > 1e-20 ? clamp((bb - dd) / aa) : 0
  }
  return result(mix(a, b, s), mix(c, d, t), [1 - s, s], [1 - t, t])
}
const pointTriangle = (p: Vec, tri: Vec[]): Closest => {
  const [a, b, c] = tri,
    u = sub(b, a),
    v = sub(c, a),
    n = cross(u, v),
    nn = dot3(n, n)
  const projected = nn > 1e-24 ? sub(p, scale(n, dot3(sub(p, a), n) / nn)) : a
  const w = sub(projected, a),
    uu = dot3(u, u),
    uv = dot3(u, v),
    vv = dot3(v, v),
    wu = dot3(w, u),
    wv = dot3(w, v),
    den = uu * vv - uv * uv
  const s = (vv * wu - uv * wv) / den,
    t = (uu * wv - uv * wu) / den
  if (s >= 0 && t >= 0 && s + t <= 1)
    return result(p, projected, [1], [1 - s - t, s, t])
  let best: Closest | undefined
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3,
      edge = sub(tri[j], tri[i]),
      along = clamp(dot3(sub(p, tri[i]), edge) / (dot3(edge, edge) || 1))
    const weights = [0, 0, 0]
    weights[i] = 1 - along
    weights[j] = along
    const hit = result(p, mix(tri[i], tri[j], along), [1], weights)
    if (!best || hit.distance < best.distance) best = hit
  }
  return best!
}
export const segmentTriangle = (a: Vec, b: Vec, tri: Vec[]): Closest => {
  const n = cross(sub(tri[1], tri[0]), sub(tri[2], tri[0])),
    direction = sub(b, a),
    den = dot3(n, direction)
  if (Math.abs(den) > 1e-20) {
    const t = dot3(n, sub(tri[0], a)) / den
    if (t >= 0 && t <= 1) {
      const p = mix(a, b, t),
        hit = pointTriangle(p, tri)
      if (hit.distance < 1e-10) return { ...hit, wa: [1 - t, t] }
    }
  }
  let best = pointTriangle(a, tri)
  best.wa = [1, 0]
  const end = pointTriangle(b, tri)
  end.wa = [0, 1]
  if (end.distance < best.distance) best = end
  for (let i = 0; i < 3; i++) {
    const hit = segmentClosest(a, b, tri[i], tri[(i + 1) % 3]),
      weights = [0, 0, 0]
    weights[i] = hit.wb[0]
    weights[(i + 1) % 3] = hit.wb[1]
    hit.wb = weights
    if (hit.distance < best.distance) best = hit
  }
  return best
}
const primitiveClosest = (a: Primitive, b: Primitive): Closest => {
  const av = a.vertices.map((p) => p.world),
    bv = b.vertices.map((p) => p.world)
  if (av.length === 2 && bv.length === 2)
    return segmentClosest(av[0], av[1], bv[0], bv[1])
  if (av.length === 2) return segmentTriangle(av[0], av[1], bv)
  if (bv.length === 2) {
    const hit = segmentTriangle(bv[0], bv[1], av)
    return {
      a: hit.b,
      b: hit.a,
      wa: hit.wb,
      wb: hit.wa,
      distance: hit.distance,
    }
  }
  let best: Closest | undefined
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3,
      hit = segmentTriangle(av[i], av[j], bv),
      weights = [0, 0, 0]
    weights[i] = hit.wa[0]
    weights[j] = hit.wa[1]
    hit.wa = weights
    if (!best || hit.distance < best.distance) best = hit
    const reverse = segmentTriangle(bv[i], bv[j], av),
      other = [0, 0, 0]
    other[i] = reverse.wa[0]
    other[j] = reverse.wa[1]
    if (reverse.distance < best.distance)
      best = {
        a: reverse.b,
        b: reverse.a,
        wa: reverse.wb,
        wb: other,
        distance: reverse.distance,
      }
  }
  return best!
}
const interpolateWitness = (vertices: Vertex[], weights: Vec): Witness =>
  vertices[0].witness.local
    ? {
        local: [0, 1, 2, 3].map((j) =>
          vertices.reduce((s, p, i) => s + p.witness.local![j] * weights[i], 0),
        ),
      }
    : {
        stem: [0, 1, 2, 3].map((j) =>
          vertices.reduce((s, p, i) => s + p.witness.stem![j] * weights[i], 0),
        ),
      }
export interface Contact {
  a: Witness
  b: Witness
  normal: Vec
  gap: number
  radius: number
}
export const closestContact = (
  a: Node,
  b: Node,
  limit: number,
  accept: (hit: Contact) => boolean = () => true,
  own = false,
): Contact | undefined => {
  let best: Contact | undefined,
    minimum = limit
  const visit = (a: Node, b: Node) => {
    if (own && a.joint && b.joint) return
    if (boxGap(a, b) > minimum || boxSeparated(a, b, minimum)) return
    if (a.primitive && b.primitive) {
      const hit = primitiveClosest(a.primitive, b.primitive),
        radius = a.primitive.radius + b.primitive.radius,
        gap = hit.distance - radius
      if (gap < minimum) {
        const candidate: Contact = {
          a: interpolateWitness(a.primitive.vertices, hit.wa),
          b: interpolateWitness(b.primitive.vertices, hit.wb),
          normal:
            hit.distance > 1e-12
              ? scale(sub(hit.a, hit.b), 1 / hit.distance)
              : [0, 0, 1],
          gap,
          radius,
        }
        if (accept(candidate)) {
          minimum = gap
          best = candidate
        }
      }
      return
    }
    const extent = (n: Node) =>
      n.hi.reduce((s, v, j) => s + (v - n.lo[j]) ** 2, 0)
    if (!a.primitive && (b.primitive || extent(a) >= extent(b))) {
      const children = childrenOf(a)
        .map((n) => ({ n, gap: boxGap(n, b) }))
        .sort((a, b) => a.gap - b.gap)
      for (const child of children) if (child.gap <= minimum) visit(child.n, b)
    } else {
      const children = childrenOf(b)
        .map((n) => ({ n, gap: boxGap(a, n) }))
        .sort((a, b) => a.gap - b.gap)
      for (const child of children) if (child.gap <= minimum) visit(a, child.n)
    }
  }
  visit(a, b)
  return best
}
export const pairContacts = (a: Shape, b: Shape, limit = 0.04) =>
  a.detailed || b.detailed
    ? [
        closestContact(a.surface, b.surface, limit),
        closestContact(a.stem, b.surface, limit),
        closestContact(a.surface, b.stem, limit),
        closestContact(a.stem, b.stem, limit),
      ]
    : [
        hullContact(a.surfaceHull, b.surfaceHull, limit),
        hullContact(a.stemHull, b.surfaceHull, limit),
        hullContact(a.surfaceHull, b.stemHull, limit),
        hullContact(a.stemHull, b.stemHull, limit),
      ]
export const contactMargin = (kind: number) =>
  kind === 0 ? 0.008 : kind === 3 ? 0.002 : 0.005

// 同じ葉の接合部は、最後の葉柄二区間と葉身の最初の二行だけ重ねる。
const connection = (stem: Witness, surface: Witness, leaf: Leaf) => {
  const w = stem.stem!,
    t = (w[1] + 2 * w[2] + 3 * w[3]) / 3
  const blade = (-surface.local![1] - leaf.stem) / leaf.length
  return t >= 22 / 24 - 1e-8 && blade <= 2 / 72 + 1e-8
}
export const selfContact = (shape: Shape, limit = 0.04) =>
  shape.selfGap >= 0.008
    ? undefined
    : closestContact(
        shape.stem,
        shape.surface,
        limit,
        (hit) => !connection(hit.a, hit.b, shape.leaf),
        true,
      )

// 両端の凸包を曲線運動の誤差分だけ膨らませる。接線方向へ動く近接面を、
// 移動距離だけを使った球で毎回細分化しないための掃引境界。
const separated = (
  a: Primitive,
  a1: Primitive,
  b: Primitive,
  b1: Primitive,
  margin: number,
) => {
  const av = [...a.vertices, ...a1.vertices].map((p) => p.world),
    bv = [...b.vertices, ...b1.vertices].map((p) => p.world)
  const radius =
    Math.max(a.radius, a1.radius) + Math.max(b.radius, b1.radius) + margin
  const axisSafe = (axis: Vec) => {
    const length = magnitude(axis)
    if (length < 1e-12) return false
    let alo = Infinity,
      ahi = -Infinity,
      blo = Infinity,
      bhi = -Infinity
    for (const p of av) {
      const d = dot3(p, axis)
      alo = Math.min(alo, d)
      ahi = Math.max(ahi, d)
    }
    for (const p of bv) {
      const d = dot3(p, axis)
      blo = Math.min(blo, d)
      bhi = Math.max(bhi, d)
    }
    return Math.max(alo - bhi, blo - ahi) >= radius * length
  }
  for (const primitive of [a, a1, b, b1])
    if (primitive.vertices.length === 3) {
      const v = primitive.vertices.map((p) => p.world)
      if (axisSafe(cross(sub(v[1], v[0]), sub(v[2], v[0])))) return true
    }
  const hit = primitiveClosest(a, b)
  if (axisSafe(sub(hit.a, hit.b))) return true
  const ae = a.vertices.map((p, i, v) =>
      sub(v[(i + 1) % v.length].world, p.world),
    ),
    be = b.vertices.map((p, i, v) => sub(v[(i + 1) % v.length].world, p.world))
  for (const x of ae) for (const y of be) if (axisSafe(cross(x, y))) return true
  return false
}
const sweptSafe = (
  a: Node,
  a1: Node,
  b: Node,
  b1: Node,
  margin: number,
  own?: Leaf,
): boolean => {
  if (own && a.joint && b.joint) return true
  let squared = 0
  for (let j = 0; j < 3; j++) {
    const gap = Math.max(
      0,
      Math.min(a.lo[j], a1.lo[j]) - Math.max(b.hi[j], b1.hi[j]),
      Math.min(b.lo[j], b1.lo[j]) - Math.max(a.hi[j], a1.hi[j]),
    )
    squared += gap * gap
  }
  if (squared >= margin * margin || boxSeparated(a, b, margin, a1, b1))
    return true
  if (
    a.primitive &&
    b.primitive &&
    own &&
    a.primitive.vertices.every((s) =>
      b.primitive!.vertices.every((p) => connection(s.witness, p.witness, own)),
    )
  )
    return true
  if (a.primitive && b.primitive)
    return separated(
      a.primitive,
      a1.primitive!,
      b.primitive,
      b1.primitive!,
      margin,
    )
  const extent = (n: Node) =>
    n.hi.reduce((s, v, j) => s + (v - n.lo[j]) ** 2, 0)
  if (!a.primitive && (b.primitive || extent(a) >= extent(b)))
    return childrenOf(a).every((child, i) =>
      sweptSafe(child, childrenOf(a1)[i], b, b1, margin, own),
    )
  return childrenOf(b).every((child, i) =>
    sweptSafe(a, a1, child, childrenOf(b1)[i], margin, own),
  )
}
export const pairSweepSafe = (
  a: Shape,
  a1: Shape,
  b: Shape,
  b1: Shape,
  errors: number[][],
) =>
  hullSweepSafe(
    a.surfaceHull,
    a1.surfaceHull,
    b.surfaceHull,
    b1.surfaceHull,
    0.008 + errors[0][0] + errors[1][0],
  ) &&
  hullSweepSafe(
    a.stemHull,
    a1.stemHull,
    b.surfaceHull,
    b1.surfaceHull,
    0.005 + errors[0][1] + errors[1][0],
  ) &&
  hullSweepSafe(
    a.surfaceHull,
    a1.surfaceHull,
    b.stemHull,
    b1.stemHull,
    0.005 + errors[0][0] + errors[1][1],
  ) &&
  hullSweepSafe(
    a.stemHull,
    a1.stemHull,
    b.stemHull,
    b1.stemHull,
    0.002 + errors[0][1] + errors[1][1],
  )

export const selfSweepSafe = (a: Shape, b: Shape, error: number[]) =>
  Math.min(a.selfGap, b.selfGap) >= 0.005 + error[2] ||
  sweptSafe(
    a.stem,
    b.stem,
    a.surface,
    b.surface,
    0.005 + error[0] + error[1],
    a.leaf,
  )
