import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  acceptsPointer,
  createBreathInput,
  createRenewal,
  detachSeeds,
  rootDirection,
  selectNearbySeeds,
} from './interaction.ts'

const COUNT = 72
const MAX_FLYING = 20
const roots = new Float32Array(COUNT * 8)
for (let i = 0; i < COUNT; i++)
  roots.set(rootDirection(i, COUNT).direction, i * 8)

// 実際の入力・候補選択・付着を外す処理を、CSS px 単位の pointermove で通す。
const trace = (height, speed, { offset = 0, spacing = 14, power = 1 } = {}) => {
  const input = createBreathInput()
  const state = new Uint8Array(COUNT)
  const head = [-Math.min(0.38, (1025 / height) * 0.32), -0.27]
  let peakFlow = 0
  const width = (0.68 * height) / 2
  input.move(head[0] - 0.34, head[1] + offset, 1, height, head, power)
  for (let px = spacing; px <= width; px += spacing) {
    const stroke = input.move(
      head[0] - 0.34 + (px * 2) / height,
      head[1] + offset,
      1 + px / speed,
      height,
      head,
      power,
    )
    if (!stroke) continue
    peakFlow = Math.max(peakFlow, Math.hypot(...stroke.velocity))
    const candidates = selectNearbySeeds(state, roots, head, stroke)
    detachSeeds(state, candidates, stroke.amount, MAX_FLYING)
  }
  return { count: state.filter((value) => value === 1).length, peakFlow }
}

test('横長の埋め込みと縦長の窓で、一なぞりで数本外れ、速いほど増える', () => {
  for (const height of [400, 450, 500, 1753]) {
    const slow = trace(height, 437.5)
    const normal = trace(height, 875)
    const fast = trace(height, 1750)
    assert(slow.count >= 2)
    assert(normal.count >= 4 && normal.count <= 8)
    assert(fast.count > normal.count && normal.count > slow.count)
    assert(fast.peakFlow > normal.peakFlow && normal.peakFlow > slow.peakFlow)
    console.log(
      `高さ ${height}px: 遅め ${slow.count} 本、14px/16ms ${normal.count} 本、速め ${fast.count} 本`,
    )
  }
})

test('入力の細かさを変えても本数が大きく変わらず、頭から離れた操作では外れない', () => {
  for (const height of [450, 1753]) {
    const normal = trace(height, 875).count
    for (const spacing of [7, 28])
      assert(Math.abs(trace(height, 875, { spacing }).count - normal) <= 1)
    assert.equal(trace(height, 875, { offset: 0.6 }).count, 0)
    assert.equal(trace(height, 875, { power: 0 }).count, 0)
    assert.equal(trace(height, 20).count, 0)
  }
})

test('なぞった範囲に近い種を選び、飛行中の上限を守る', () => {
  const state = new Uint8Array(COUNT)
  const input = createBreathInput()
  const head = [-0.2, -0.27]
  input.move(-0.54, -0.27, 1, 1753, head, 1)
  const stroke = input.move(0.14, -0.27, 1.1, 1753, head, 1)
  assert(stroke)
  const candidates = selectNearbySeeds(state, roots, head, stroke)
  assert(candidates.length > 0 && candidates.length < COUNT)
  for (const i of candidates) {
    const scale = 1 / (1 + roots[i * 8 + 2] * 0.265 * 0.22)
    const y = (head[1] + roots[i * 8 + 1] * 0.265) * scale
    assert(Math.abs(y - head[1]) <= 0.14)
  }
  const all = Array.from(state, (_, i) => i)
  assert.equal(detachSeeds(state, all, COUNT, MAX_FLYING).length, 20)
  assert.equal(detachSeeds(state, all, COUNT, MAX_FLYING).length, 0)
  state.fill(2, 0, 20)
  assert.equal(detachSeeds(state, all, COUNT, MAX_FLYING).length, 20)
})

test('止まった入力と再入場で息を作らず、マウスの hover と一本目の指を受け取る', () => {
  const input = createBreathInput()
  const move = (x, time) => input.move(x, 0, time, 450, [0, 0], 1)
  assert.equal(move(0, 0), undefined)
  assert.equal(move(0, 0.016), undefined)
  assert.equal(move(1, 1), undefined)
  input.reset()
  assert.equal(move(-1, 1.016), undefined)
  assert(acceptsPointer('mouse', false))
  assert(acceptsPointer('touch', true))
  assert(!acceptsPointer('touch', false))
})

test('残り 18 本で待ち、見えなくなったところで一度戻して静かに現れる', () => {
  const renewal = createRenewal(COUNT)
  assert.equal(renewal.advance(0, 19).reset, false)
  assert(!renewal.active)
  renewal.advance(1, 18)
  assert(renewal.active)
  assert.equal(renewal.advance(3.49, 18).alpha, 1)
  assert.equal(renewal.advance(3.5, 18).alpha, 1)
  const fading = renewal.advance(4.5, 18)
  assert(fading.alpha > 0 && fading.alpha < 1)
  const reset = renewal.advance(5.5, 18)
  assert(reset.reset)
  assert.equal(reset.alpha, 0)
  assert.equal(renewal.advance(5.51, COUNT).reset, false)
  const appearing = renewal.advance(7, COUNT)
  assert(appearing.alpha > 0 && appearing.alpha < 1)
  const complete = renewal.advance(9, COUNT)
  assert(complete.completed)
  assert.equal(complete.alpha, 1)
  assert(Math.abs(complete.y + 0.27) < 1e-12)
  assert(!renewal.active)
  renewal.advance(10, 18)
  assert(renewal.active)
  renewal.advance(11, COUNT)
  assert(!renewal.active)
})
