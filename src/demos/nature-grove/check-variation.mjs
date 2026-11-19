import assert from 'node:assert/strict'
import {
  branchGrowth,
  createTree,
  curve,
  growTree,
  leafGrowth,
  lightDirection,
  STRIDE,
} from './tree.ts'

const settings = { generations: 6, angle: 28, forks: 2 }
const origin = [0, 0, 0]
const measure = (model, root = origin) => {
  const { branches, vertices } = model
  const parents = new Set(branches.map((b) => b.parent))
  const tips = branches.filter((b) => !parents.has(b.id))
  const crown = []
  const tones = []
  for (let i = 0; i < vertices.length; i += STRIDE) {
    if (vertices[i + 9] !== 2) continue
    crown.push([vertices[i], vertices[i + 1], vertices[i + 2]])
    tones.push([vertices[i + 13], vertices[i + 14], vertices[i + 15]])
  }
  const span = (axis) => {
    const values = crown.map((p) => p[axis])
    return Math.max(...values) - Math.min(...values)
  }
  const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length
  return {
    height: Math.max(...crown.map((p) => p[1])) - root[1],
    crownRatio: Math.max(span(0), span(2)) / span(1),
    tips: tips.length,
    offset: Math.hypot(
      mean(crown.map((p) => p[0])) - root[0],
      mean(crown.map((p) => p[2])) - root[2],
    ),
    // 成熟葉の基準色に、実際に頂点へ渡す木・枝ごとの色を掛ける。
    leafRGB: [0.055, 0.24, 0.035].map(
      (base, axis) => base * mean(tones.map((p) => p[axis])),
    ),
  }
}
const rows = []
for (let seed = 1; seed <= 10; seed++) {
  // 周囲の影響を除いても、同じ設定の木に差が出ることを確かめる。
  const model = createTree(settings, seed, origin, origin)
  assert.equal(model.vertices.length % STRIDE, 0)
  assert.ok(model.vertices.every(Number.isFinite))
  assert.ok(model.indices.every((i) => i < model.vertices.length / STRIDE))
  assert.deepEqual(model, createTree(settings, seed, origin, origin))
  const prefix = growTree({ ...settings, generations: 4 }, seed)
  assert.deepEqual(
    model.branches.slice(0, prefix.branches.length),
    prefix.branches,
  )
  for (const b of model.branches) {
    if (b.parent >= 0) assert.deepEqual(b.a, model.branches[b.parent].d)
    for (let i = 0; i <= 8; i++)
      assert.ok(curve(b, i / 8).every(Number.isFinite))
  }
  rows.push({ seed, ...measure(model) })
}
for (const row of rows)
  console.log(JSON.stringify({ arrangement: 'isolated', ...row }))
const range = (values) => Math.max(...values) - Math.min(...values)
for (const key of ['height', 'crownRatio', 'offset']) {
  const values = rows.map((r) => r[key])
  assert.equal(new Set(values.map((v) => v.toFixed(3))).size, 10, key)
  assert.ok(range(values) > (key === 'height' ? 0.7 : 0.2), key)
}
assert.equal(new Set(rows.map((r) => r.tips)).size, 10, '枝先の数の多様性')
for (let axis = 0; axis < 3; axis++) {
  const values = rows.map((r) => r.leafRGB[axis])
  assert.equal(new Set(values.map((v) => v.toFixed(4))).size, 10)
  assert.ok(range(values) > [0.02, 0.06, 0.015][axis], '葉色の散らばり')
}
// 近隣の木を順に加える林でも数値を出し、根元からの偏りを測る。
const neighbors = []
for (let seed = 1; seed <= 10; seed++) {
  const root = [((seed - 1) % 5) * 1.5 - 3, 0, seed <= 5 ? -2.5 : 0]
  const light = lightDirection(root, neighbors)
  const model = createTree(settings, seed, root, light)
  console.log(
    JSON.stringify({ arrangement: 'grove', seed, ...measure(model, root) }),
  )
  if (seed > 1)
    assert.notDeepEqual(model.branches, growTree(settings, seed, root).branches)
  neighbors.push(root)
}
// GUI の端の設定でも有限で、根元が同じ位置にある。
for (const forks of [2, 3]) {
  for (const angle of [18, 42]) {
    for (let seed = 1; seed <= 20; seed++) {
      const root = [1, 0, 1]
      const light = lightDirection(root, [[0, 0, 1]])
      assert.ok(light[0] > 0)
      const model = createTree({ ...settings, forks, angle }, seed, root, light)
      assert.deepEqual(model.branches[0].a, root)
      assert.ok(model.branches.every((b) => b.d[1] > b.a[1]))
      assert.ok(model.vertices.every(Number.isFinite))
      assert.ok(model.indices.every((i) => i < model.vertices.length / STRIDE))
    }
  }
}
for (let generation = 1; generation <= 6; generation++) {
  const start = (generation - 1) * 0.7
  assert.equal(branchGrowth(generation, start), generation === 1 ? 0.32 : 0)
  assert.equal(leafGrowth(generation, start + 0.52), 0)
  assert.ok(branchGrowth(generation, start + 0.52) > 0.999)
  assert.ok(leafGrowth(generation, start + 0.7) > 0.999)
}
console.log(
  'PASS: 10 本の個性、再現性、既存枝の不変性、接続、有限性、GUI の端、成長の時間割',
)
