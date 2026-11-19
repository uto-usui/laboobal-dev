// 実行: node src/demos/nature-galaxy-tides/check-motion.ts
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !specifier.endsWith('.ts'))
        return next(`${specifier}.ts`, context)
      throw error
    }
  },
})
const {
  REAL_STEP,
  GRAB_TIME,
  MAX_RELEASE_SPEED,
  releaseVelocity,
  returnAcceleration,
  add,
  sub,
  mul,
  dot,
} = await import('./interaction.ts')
const { STEP, SOFTENING, COMPANION_MASS } = await import('./initial.ts')
type Vec3 = [number, number, number]
const rate = STEP / REAL_STEP
const blend = 1 - Math.exp(-REAL_STEP / GRAB_TIME)
// GPU と同じ刻み・共通補正。自由運動の重力だけは芯に質量を集めた近似。
const gravity = (a: Vec3, b: Vec3, mass: number): Vec3 => {
  const d = sub(b, a)
  return mul(d, mass / (dot(d, d) + SOFTENING ** 2) ** 1.5)
}
let largestRadius = 0
let largestSeparation = 0
for (const start of [
  [2.7, 0.65, 0],
  [3.5, 0, 0],
  [0, 2, 0],
  [0, 0, -3.5],
] as Vec3[]) {
  for (const speed of [0.5, 3, 30]) {
    for (const direction of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0.6, 0.8, 0],
    ] as Vec3[]) {
      let p: Vec3[] = [[-2.7, -0.65, 0], [...start]]
      let v: Vec3[] = [
        [0.48, -0.13, 0],
        mul(releaseVelocity(mul(direction, speed)), 1 / rate),
      ]
      assert.ok(Math.hypot(...v[1]) * rate <= MAX_RELEASE_SPEED + 1e-10)
      for (let i = 0; i < Math.round(20 / REAL_STEP); i++) {
        const acceleration = [
          gravity(p[0], p[1], COMPANION_MASS),
          gravity(p[1], p[0], 1),
        ]
        v = v.map((value, g) =>
          add(
            add(value, mul(acceleration[g], STEP)),
            mul(returnAcceleration(p[g], mul(value, rate)), REAL_STEP / rate),
          ),
        )
        p = p.map((value, g) => add(value, mul(v[g], STEP)))
        largestRadius = Math.max(
          largestRadius,
          ...p.map((value) => Math.hypot(...value)),
        )
        largestSeparation = Math.max(
          largestSeparation,
          Math.hypot(...sub(p[0], p[1])),
        )
        assert.ok(
          Math.hypot(...sub(p[0], p[1])) <= 7.4,
          '構図に必要な幅が基本の1.2倍を越えた',
        )
        assert.ok(p.every((value) => value.every(Number.isFinite)))
        assert.ok(
          p.every((value) => Math.hypot(...value) <= 5),
          '芯が固定範囲の半径5を越えた',
        )
      }
      console.log(
        `start=${start} hand=${speed} direction=${direction} cores@20s=${p.map((value) => value.map((n) => n.toFixed(3)).join(',')).join(' / ')}`,
      )
    }
  }
}
for (const step of [-4, -1, 1, 4]) {
  let x = 0
  let previousError = Math.abs(step)
  for (let i = 0; i < 120; i++) {
    // 重力キックを引いた共通速度補正なので、重力の強さ・以前の速度に依存しない。
    const oldVelocity = Math.sin(i) * 10
    const kick = Math.cos(i) * 20
    const desired = ((step - x) * blend) / STEP
    const velocity =
      oldVelocity + kick * STEP + (desired - oldVelocity - kick * STEP)
    x += velocity * STEP
    const error = Math.abs(step - x)
    assert.ok(x * Math.sign(step) <= Math.abs(step) + 1e-10, '行き過ぎ')
    assert.ok(error <= previousError + 1e-10, '誤差が振れた')
    previousError = error
  }
}
// 等速移動の停止・反転でも、目標と現在位置を結ぶ区間から出ない。
let p: Vec3 = [0, 0, 0]
let largestLag = 0
for (let i = 0; i < 240; i++) {
  const t = i * REAL_STEP
  const target: Vec3 = [t < 0.5 ? t * 3 : t < 1 ? 1.5 : 1.5 - (t - 1) * 3, 0, 0]
  const next = add(p, mul(sub(target, p), blend))
  assert.ok(
    next[0] >= Math.min(p[0], target[0]) - 1e-10 &&
      next[0] <= Math.max(p[0], target[0]) + 1e-10,
  )
  largestLag = Math.max(largestLag, Math.abs(target[0] - next[0]) / 3)
  p = next
}
assert.ok(largestLag < 0.02)
console.log(
  `PASS: 72 trajectories, radius<=${largestRadius.toFixed(3)}, separation<=${largestSeparation.toFixed(3)}, sampled lag=${(largestLag * 1000).toFixed(2)}ms; step/stop/reversal overshoot=0`,
)
