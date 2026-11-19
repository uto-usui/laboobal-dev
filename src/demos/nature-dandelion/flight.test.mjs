import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FLIGHT, limitVelocity } from './flight.ts'
import {
  createField,
  createSeed,
  projectSeed,
  stepSeed,
} from './flight-reference.mjs'
import {
  createBreathInput,
  detachSeeds,
  rootDirection,
  selectNearbySeeds,
} from './interaction.ts'

const WIDTH = 1280
const HEIGHT = 800
const HEAD = [-0.38, -0.27]
const checkpoints = new Map([
  [45, 0.3],
  [87, 1],
  [207, 3],
])
const roots = new Float32Array(72 * 8)
for (let i = 0; i < 72; i++) roots.set(rootDirection(i, 72).direction, i * 8)

// main.ts と同じ 60Hz の描画と 120Hz の種の更新。pointermove は 30 段、450ms。
const trajectory = (
  power,
  { example = false, direction = 1, speedScale = 1 } = {},
) => {
  const field = createField()
  const state = new Uint8Array(72)
  const input = createBreathInput()
  const seeds = new Map()
  const snapshots = new Map()
  let event = 1
  let strength = 0
  let position = [0, 0]
  let velocity = [0, 0, 0]
  let peak = 0
  let launchPeak = 0
  if (example)
    for (const [n, i] of [18, 30, 42, 54].entries())
      seeds.set(i, createSeed(i, HEAD, n))
  input.move(HEAD[0] - direction * 0.475, HEAD[1], 0, HEIGHT, HEAD, power)
  for (let frame = 1; frame <= 207; frame++) {
    const time = frame / 60
    while (
      !example &&
      event <= 30 &&
      (event * 0.015) / speedScale <= time + 1e-10
    ) {
      const stroke = input.move(
        HEAD[0] + direction * (-0.475 + (event * 0.95) / 30),
        HEAD[1],
        (event * 0.015) / speedScale,
        HEIGHT,
        HEAD,
        power,
      )
      event++
      if (!stroke) continue
      strength = stroke.strength
      velocity = stroke.velocity
      position = [(stroke.from.x + stroke.to.x) / 2, HEAD[1]]
      assert(Math.hypot(...velocity) <= FLIGHT.breath + 1e-12)
      for (const i of detachSeeds(
        state,
        selectNearbySeeds(state, roots, HEAD, stroke),
        stroke.amount,
        20,
      ))
        seeds.set(i, createSeed(i, HEAD))
    }
    strength *= Math.exp(-6 / 60)
    field.step(1 / 60, [...position, strength], velocity, example ? 1 : 0)
    for (let step = 0; step < 2; step++)
      for (const s of seeds.values()) {
        const flow = field.sample(s.pos)
        if (!s.flying)
          launchPeak = Math.max(
            launchPeak,
            Math.hypot(...limitVelocity(flow, FLIGHT.initial)),
          )
        stepSeed(s, flow, 1 / 120, time, FLIGHT)
        assert(
          [...s.pos, ...s.vel, ...s.axis, ...s.angular, s.age].every(
            Number.isFinite,
          ),
        )
        const speed = Math.hypot(...s.vel)
        peak = Math.max(peak, speed)
        assert(speed <= FLIGHT.seed + 1e-12)
        assert(s.axis[1] > 0.75, '傘は上、種は下に保つ')
      }
    if (!checkpoints.has(frame)) continue
    const snapshot = [...seeds.values()].map((s) => ({
      id: s.i,
      position: [...s.pos],
      velocity: [...s.vel],
      speed: Math.hypot(...s.vel),
      screen: projectSeed(s, WIDTH, HEIGHT),
    }))
    assert(snapshot.length > 0)
    if (!example) {
      for (const s of seeds.values()) {
        // 中心だけでなく、傘の幅と柄・種の端まで画面内に収まるかを見る。
        for (const p of [
          s.pos.map((v, j) => v - s.axis[j] * 0.223 * 0.85),
          ...[-1, 1].flatMap((sign) => [
            [s.pos[0] + sign * 0.08, s.pos[1], s.pos[2]],
            [s.pos[0], s.pos[1] + sign * 0.08, s.pos[2]],
          ]),
        ]) {
          const [x, y] = projectSeed({ pos: p }, WIDTH, HEIGHT)
          assert(
            x > 0 && x < WIDTH && y > 0 && y < HEIGHT,
            `種 ${s.i}: 画面外 (${x}, ${y})`,
          )
        }
        assert(s.age < 13, '寿命によるフェード開始前')
      }
    }
    snapshots.set(checkpoints.get(frame), snapshot)
  }
  assert(launchPeak <= FLIGHT.initial + 1e-12)
  return { snapshots, count: seeds.size, peak, launchPeak }
}

test('380px/450ms の息で外れた全種が、0.3秒・1秒・3秒後も見本に近い速さで画面内にある', () => {
  const example = trajectory(0, { example: true })
  const runs = [0.5, 1, 2].map((power) => ({ power, ...trajectory(power) }))
  assert(runs[0].count < runs[1].count && runs[1].count < runs[2].count)
  assert(
    runs[0].peak < runs[1].peak && runs[1].peak < runs[2].peak,
    `息の設定ごとの最大速度: ${runs.map((run) => run.peak).join(', ')}`,
  )
  for (const run of runs) {
    console.log(
      `息 ${run.power}: ${run.count} 本、初速上限実測 ${run.launchPeak.toFixed(4)}、飛行中最大 ${run.peak.toFixed(4)}`,
    )
    for (const [after, snapshot] of run.snapshots) {
      const reference = example.snapshots.get(after)
      const referenceMax = Math.max(...reference.map((s) => s.speed))
      console.log(
        `終了 ${after}s 後 / 見本の速度 ${reference.map((s) => s.speed.toFixed(4)).join(', ')}`,
      )
      for (const s of snapshot) {
        assert(s.speed <= referenceMax * 3, '見本の最大速度の3倍以内')
        console.log(
          `種 ${s.id}: 位置 [${s.position.map((v) => v.toFixed(4))}]、速度 [${s.velocity.map((v) => v.toFixed(4))}]、速さ ${s.speed.toFixed(4)}、画面 [${s.screen.map((v) => v.toFixed(1))}]`,
        )
      }
    }
  }
})

test('速い逆向きの最大設定でも、速度の上限と3秒後までの画面内を守る', () => {
  const run = trajectory(2, { direction: -1, speedScale: 4 })
  assert(run.count > 0 && run.count <= 20)
  assert(run.peak <= FLIGHT.seed + 1e-12)
})

test('速度制限は向きを保ち、ゼロでも有限で、斜めの息にも全長で効く', () => {
  assert.deepEqual(limitVelocity([0, 0, 0], FLIGHT.air), [0, 0, 0])
  for (const v of [
    [3, 4, 12],
    [-10000, 10000, 10000],
    [0.1, 0, 0],
  ]) {
    const bounded = limitVelocity(v, FLIGHT.air)
    assert(bounded.every(Number.isFinite))
    assert(Math.hypot(...bounded) <= FLIGHT.air + 1e-12)
  }
  const input = createBreathInput()
  input.move(0, 0, 0, HEIGHT, HEAD, 2)
  const stroke = input.move(1, 1, 0.01, HEIGHT, HEAD, 2)
  assert(stroke && Math.hypot(...stroke.velocity) <= FLIGHT.breath + 1e-12)
})
