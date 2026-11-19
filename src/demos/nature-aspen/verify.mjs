import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { hullContact, hullSweepSafe } from './convex.ts'
import { createSettledLeaves, stepLeaves, pose, setPose } from './contacts.ts'
import {
  contactShape,
  pairContacts,
  selfContact,
  contactMargin,
  segmentClosest,
  segmentTriangle,
} from './contact-geometry.ts'
import {
  leafClearance,
  branchSurface,
  branchX,
  branchSlope,
  BRANCH_SEGMENTS,
  BRANCH_SIDES,
  normalize,
  dot,
  leafBasis,
  stemControls,
  stemPoint,
  windAt,
} from './simulation.ts'

const settings = { wind: 1.5, damping: 0.5, automatic: false, light: 1.2 }
const dt = 1 / 120,
  tolerance = 1e-4
const minima = {
  branch: Infinity,
  sweptBranch: Infinity,
  surface: Infinity,
  stemSurface: Infinity,
  stems: Infinity,
  self: Infinity,
  stemBranch: Infinity,
}
const stats = {
  steps: 0,
  substeps: 0,
  iterations: 0,
  clipped: 0,
  contacts: 0,
  oracleChecks: 0,
  maxStep: 0,
  maxYaw: 0,
  orderError: 0,
  quietStep: 0,
}
const timings = []
const started = performance.now()
const tri = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
]
// 両端が離れていても、途中で面を通過する凸包を安全扱いしない。
const hull = (z, x = 0) => ({
  key: {},
  radius: 0,
  points: tri.map((p) => ({
    world: [p[0] + x, p[1], p[2] + z],
    witness: { local: [...p, 0] },
  })),
})
assert.equal(hullContact(hull(-1), hull(1), 0.008), undefined)
assert(hullContact(hull(0), hull(0), 0.008).gap <= 0)
assert(!hullSweepSafe(hull(-1), hull(1), hull(0), hull(0), 0.008))
assert(hullSweepSafe(hull(0.02), hull(0.02, 0.2), hull(0), hull(0), 0.008))
assert(
  segmentTriangle([0.2, 0.2, -1], [0.2, 0.2, 1], tri).distance < 1e-10,
  'edge through a face',
)
assert(
  Math.abs(segmentTriangle([0.2, 0.2, 1], [0.4, 0.2, 1], tri).distance - 1) <
    1e-10,
)
assert(
  segmentClosest([0, 0, 0], [1, 0, 0], [0.5, -1, 0], [0.5, 1, 0]).distance <
    1e-10,
)
assert(
  segmentClosest([0, 0, 0], [0, 0, 0], [1, 0, 0], [2, 0, 0]).distance === 1,
)

// 解決処理の最近点コードとは別に、線分と三角形の交差をMöller–Trumboreで照合する。
const minus = (a, b) => a.map((v, j) => v - b[j])
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const intersects = (a, b, tri) => {
  const direction = minus(b, a),
    u = minus(tri[1], tri[0]),
    v = minus(tri[2], tri[0]),
    p = cross(direction, v),
    den = dot(u, p)
  if (Math.abs(den) < 1e-12) return false
  const t = minus(a, tri[0]),
    s = dot(t, p) / den,
    q = cross(t, u),
    r = dot(direction, q) / den,
    h = dot(v, q) / den
  return (
    s >= -1e-8 && r >= -1e-8 && s + r <= 1 + 1e-8 && h >= -1e-8 && h <= 1 + 1e-8
  )
}
const box = (points) => ({
  lo: [0, 1, 2].map((j) => Math.min(...points.map((p) => p[j]))),
  hi: [0, 1, 2].map((j) => Math.max(...points.map((p) => p[j]))),
})
const overlap = (a, b) =>
  a.lo.every((v, j) => v <= b.hi[j] + 1e-8 && b.lo[j] <= a.hi[j] + 1e-8)
const oracleGeometry = (leaf) => {
  const basis = leafBasis(leaf, 0)
  const vertices = Array.from({ length: 73 * 25 }, (_, i) => {
    const t = Math.floor(i / 25) / 72,
      s = ((i % 25) / 24) * 2 - 1
    const p = [
      s *
        0.5 *
        Math.max(0, Math.sin(t * Math.PI)) ** leaf.shape[0] *
        (1.13 - leaf.shape[1] * t) *
        leaf.width *
        (1 + 0.008 * Math.sin(t * 191 + leaf.phase)),
      -leaf.stem - t * leaf.length,
      leaf.z +
        0.105 * s * s * Math.sin(t * Math.PI) +
        (0.07 + leaf.bend) * t * t +
        0.025 * (1 - Math.abs(s)) * Math.sin(t * Math.PI) +
        0.022 * s * t,
    ]
    return leaf.pivot.map(
      (v, j) =>
        v + basis[0][j] * p[0] + basis[1][j] * p[1] + basis[2][j] * p[2],
    )
  })
  const patches = []
  for (let r = 0; r < 72; r += 6)
    for (let c = 0; c < 24; c += 6) {
      const triangles = []
      for (let row = r; row < r + 6; row++)
        for (let col = c; col < c + 6; col++) {
          const a = row * 25 + col,
            b = a + 25
          for (const ids of [
            [a, b, a + 1],
            [a + 1, b, b + 1],
          ]) {
            const points = ids.map((i) => vertices[i])
            triangles.push({ points, box: box(points), row })
          }
        }
      patches.push({ triangles, box: box(triangles.flatMap((t) => t.points)) })
    }
  const controls = stemControls(leaf),
    stem = Array.from({ length: 25 }, (_, i) =>
      stemPoint(controls, i / 24).map((v, j) => v + leaf.pivot[j]),
    )
  return { patches, stem }
}
const oracle = (leaves, label) => {
  const geometry = leaves.map(oracleGeometry)
  for (let a = 0; a < leaves.length; a++)
    for (let b = a + 1; b < leaves.length; b++) {
      const ga = geometry[a],
        gb = geometry[b]
      for (const pa of ga.patches)
        for (const pb of gb.patches)
          if (overlap(pa.box, pb.box))
            for (const ta of pa.triangles)
              for (const tb of pb.triangles)
                if (overlap(ta.box, tb.box)) {
                  for (let j = 0; j < 3; j++)
                    assert(
                      !intersects(
                        ta.points[j],
                        ta.points[(j + 1) % 3],
                        tb.points,
                      ) &&
                        !intersects(
                          tb.points[j],
                          tb.points[(j + 1) % 3],
                          ta.points,
                        ),
                      `oracle surface intersection ${label} ${a}/${b}`,
                    )
                }
      for (const [ga, gb] of [
        [geometry[a], geometry[b]],
        [geometry[b], geometry[a]],
      ])
        for (let j = 0; j < 24; j++) {
          const sb = box([ga.stem[j], ga.stem[j + 1]])
          for (const patch of gb.patches)
            if (overlap(sb, patch.box))
              for (const tri of patch.triangles)
                if (overlap(sb, tri.box))
                  assert(
                    !intersects(ga.stem[j], ga.stem[j + 1], tri.points),
                    `oracle stem intersection ${label} ${a}/${b}`,
                  )
        }
    }
  stats.oracleChecks++
}
const check = (leaves, label, swept = false) => {
  const shapes = leaves.map((leaf) => contactShape(leaf, true))
  for (let a = 0; a < leaves.length; a++) {
    const own = selfContact(shapes[a], 0.035)
    if (own) {
      const margin = own.gap - 0.005
      minima.self = Math.min(minima.self, margin)
      assert(margin >= -tolerance, `${label} self ${a}: ${margin}`)
    }
    const gap = leafClearance(leaves[a])
    const key = swept ? 'sweptBranch' : 'branch'
    minima[key] = Math.min(minima[key], gap)
    assert(gap >= 0.015 - tolerance, `${label} branch ${a}: ${gap}`)
    for (let b = a + 1; b < leaves.length; b++)
      for (const [kind, contact] of pairContacts(
        shapes[a],
        shapes[b],
        0.035,
      ).entries())
        if (contact) {
          const gap = contact.gap - contactMargin(kind),
            key = kind === 0 ? 'surface' : kind === 3 ? 'stems' : 'stemSurface'
          minima[key] = Math.min(minima[key], gap)
          assert(
            gap >= -tolerance,
            `${label} ${key} ${a}/${b}: ${gap}, ${JSON.stringify(contact)}`,
          )
        }
    assert(
      [...pose(leaves[a]), ...leaves[a].velocity, leaves[a].bendVelocity].every(
        Number.isFinite,
      ),
      `${label} nonfinite ${a}`,
    )
  }
}
// 再現可能な複数の枝で、初期交差と描画輪郭の一致を照合する。
for (const narrow of [false, true]) {
  for (let seed = 0; seed < 32; seed++) {
    const leaves = createSettledLeaves(narrow, seed * 2654435761)
    check(leaves, `seed ${seed} narrow ${narrow}`)
    oracle(leaves, `seed ${seed} narrow ${narrow}`)
  }
}
console.log('64 seeded initial configurations passed')
let minFrame = 1,
  minAlong = Infinity
for (const narrow of [false, true]) {
  const leaves = createSettledLeaves(narrow, 20261118)
  assert.equal(leaves.length, narrow ? 3 : 6)
  assert(
    leaves.every((l) => l.color[0] > l.color[2] && l.color[1] > l.color[2]),
  )
  assert(leaves.every((leaf) => leaf.samples.length === 48))
  check(leaves, `initial ${narrow}`)
  oracle(leaves, `initial ${narrow}`)
  for (let r = 0; r < BRANCH_SEGMENTS; r++) {
    const x0 = branchX(r),
      x1 = branchX(r + 1),
      n0 = normalize([-branchSlope(x0), 1, 0]),
      n1 = normalize([-branchSlope(x1), 1, 0]),
      tangent = normalize([1, branchSlope((x0 + x1) / 2), 0])
    minFrame = Math.min(minFrame, dot(n0, n1))
    for (let c = 0; c < BRANCH_SIDES; c++) {
      const a = branchSurface(x0, c, leaves),
        b = branchSurface(x1, c, leaves)
      minAlong = Math.min(minAlong, dot(minus(b, a), tangent))
      assert.deepEqual(
        branchSurface(x0, c, leaves),
        branchSurface(x0, c + BRANCH_SIDES, leaves),
      )
    }
  }
  const reverse = createSettledLeaves(narrow, 20261118).reverse()
  let returning = 0,
    peak = 0,
    burstYaw = 0,
    burstReversal = false,
    previousSign = 0
  for (let step = 0; step < 7200; step++) {
    const time = step * dt
    const winds = leaves.map((leaf) => {
      if (step < 36) return 3.5
      if (step < 360) return 0
      if (step < 1440) return 3.5
      if (step < 2520) return -3.5
      if (step < 3600) return Math.sign(Math.sin((step - 2520) * 0.057)) * 3.5
      if (step < 4800) {
        const local = time - 30,
          direction = Math.floor(local / 3) % 2 === 0 ? 1 : -1
        const gust = {
          at: Math.floor(local / 3) * 3,
          direction,
          strength: 1.91,
          from: Math.min(...leaves.map((l) => l.x * direction)) - 0.7,
        }
        return (
          windAt(gust, local, leaf.x) +
          0.17 * Math.sin(time * 3.7 + leaf.phase) +
          0.11 * Math.sin(time * 6.1 + leaf.phase * 1.3)
        )
      }
      return 0
    })
    const previous = leaves.map(pose),
      label = `width=${narrow} step=${step}`
    let checkMs = 0
    const at = performance.now()
    const result = stepLeaves(leaves, winds, dt, settings, (before) => {
      const checkStart = performance.now()
      const after = leaves.map(pose)
      check(leaves, label)
      for (const t of [0.25, 0.5, 0.75]) {
        leaves.forEach((leaf, i) =>
          setPose(
            leaf,
            before[i].map((v, j) => v + (after[i][j] - v) * t),
          ),
        )
        check(leaves, `${label} t=${t}`, true)
      }
      leaves.forEach((leaf, i) => setPose(leaf, after[i]))
      checkMs += performance.now() - checkStart
    })
    timings.push(performance.now() - at - checkMs)
    for (const k of ['substeps', 'iterations', 'clipped', 'contacts'])
      stats[k] += result[k]
    stats.steps++
    const change = Math.max(
      ...leaves.flatMap((leaf, i) =>
        leaf.angle.map((v, j) => Math.abs(v - previous[i][j])),
      ),
    )
    stats.maxStep = Math.max(stats.maxStep, change)
    stats.maxYaw = Math.max(
      stats.maxYaw,
      ...leaves.map((l) => Math.abs(l.angle[1])),
    )
    if (step < 360) {
      burstYaw = Math.max(burstYaw, ...leaves.map((l) => Math.abs(l.angle[1])))
      const sign = Math.sign(leaves[0].velocity[1])
      if (step > 36 && previousSign > 0 && sign < 0) burstReversal = true
      previousSign = sign
    }
    if (step > 6959) stats.quietStep = Math.max(stats.quietStep, change)
    if (step >= 4800) {
      peak = Math.max(peak, ...leaves.map((l) => Math.abs(l.angle[1])))
      if (leaves.some((leaf, i) => leaf.angle[1] * previous[i][1] < 0))
        returning++
    }
    if (step < 180) {
      stepLeaves(reverse, [...winds].reverse(), dt, settings)
      for (let i = 0; i < leaves.length; i++)
        stats.orderError = Math.max(
          stats.orderError,
          ...pose(leaves[i]).map((v, j) =>
            Math.abs(v - pose(reverse.at(-1 - i))[j]),
          ),
        )
    }
    if (step % 120 === 0) {
      oracle(leaves, label)
      for (const leaf of leaves) {
        const controls = stemControls(leaf)
        for (let j = 17; j <= 100; j++) {
          const p = stemPoint(controls, j / 100).map(
            (v, i) => v + leaf.pivot[i],
          )
          let gap = Infinity
          for (const [ox, oy, dx, dy, r] of leaf.obstacles) {
            const px = p[0] - ox,
              py = p[1] - oy,
              t = Math.max(
                0,
                Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)),
              )
            gap = Math.min(
              gap,
              Math.hypot(px - t * dx, py - t * dy, p[2] + 0.12) - r - 0.014,
            )
          }
          minima.stemBranch = Math.min(minima.stemBranch, gap)
          assert(gap >= -tolerance, `${label} stem/branch ${gap}`)
        }
      }
    }
    if (step % 1200 === 1199)
      console.log(
        JSON.stringify({
          narrow,
          step: step + 1,
          minima,
          seconds: (performance.now() - started) / 1000,
        }),
      )
  }
  assert(
    burstYaw > Math.PI / 2,
    `short gust did not flip: ${narrow} ${burstYaw}`,
  )
  assert(burstReversal, 'no swing back after short gust')
  assert(returning > 0 && peak > 0.1, 'no free oscillation after contact')
}
assert(stats.orderError < 1e-10)
assert(stats.maxStep < 0.15, `angle jump ${stats.maxStep}`)
assert(stats.quietStep < 0.001, `quiet jitter ${stats.quietStep}`)
assert(minFrame > 0.99 && minAlong > 0)
timings.sort((a, b) => a - b)
console.log(
  JSON.stringify({
    stats,
    minima,
    minFrame,
    minAlong,
    seconds: (performance.now() - started) / 1000,
    simulationStepMs: {
      median: timings[Math.floor(timings.length * 0.5)],
      p95: timings[Math.floor(timings.length * 0.95)],
    },
  }),
)
