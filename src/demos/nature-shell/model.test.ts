import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CELLS,
  createAutomaton,
  createMipChain,
  historyRow,
  LIVE_ROWS,
  PATTERNS,
  ROWS,
  SEED,
} from './automaton.ts'
import {
  frameShell,
  followShell,
  START_SIZE,
  type Vec3,
  nearestRimCell,
  projectPoint,
  shellPoint,
} from './geometry.ts'
import { camera } from '../../shared/gpu/wgsl.ts'
import {
  automaticRows,
  DURATION,
  INITIAL_ROWS,
  REMAINING_DURATION,
} from './growth.ts'
import { measurePattern } from './measure-pattern.mjs'

const countWhite = (data: Uint8Array) => {
  let count = 0
  for (let i = 0; i < data.length; i += 4) count += data[i] / 255
  return count
}
const quiet = () => {
  const model = createAutomaton(PATTERNS.三角, 1, [])
  model.takeControl()
  return model
}

test('入力した位置から左右へ伝わり、閉じた縁の反対側で衝突して消える', () => {
  const model = quiet()
  model.excite(100)
  model.growTo(10)
  const row = model.history.subarray(9 * CELLS * 4, 10 * CELLS * 4)
  assert.equal(countWhite(row), 21)
  assert.equal(row[90 * 4], 255)
  assert.equal(row[110 * 4], 255)
  model.growTo(300)
  assert.equal(model.hasActivity, false)
  assert.equal(
    countWhite(model.history.subarray(299 * CELLS * 4, 300 * CELLS * 4)),
    0,
  )
})

test('別の入力との衝突で終わる時刻が変わり、記録済みの行は変わらない', () => {
  const alone = quiet()
  const pair = quiet()
  alone.excite(100)
  pair.excite(100)
  pair.excite(160)
  alone.growTo(40)
  pair.growTo(40)
  assert.equal(alone.history[(39 * CELLS + 130) * 4], 255)
  assert.equal(pair.history[(39 * CELLS + 130) * 4], 0)
  const past = pair.history.slice(0, 40 * CELLS * 4)
  pair.excite(250)
  pair.growTo(80)
  assert.deepEqual(pair.history.subarray(0, past.length), past)
})

test('操作後は新しい自然発火がなく、規則の変更でも殻を初めから作り直さない', () => {
  const model = quiet()
  model.growTo(80)
  assert.equal(countWhite(model.history), 0)
  model.configure(PATTERNS.縞)
  assert.equal(model.row, 80)
  model.excite(80)
  model.advance()
  assert.ok(countWhite(model.history) > 0)
  assert.equal(model.row, 81)
})

test('完成後も入力でき、循環する帯より内側の模様は保たれる', () => {
  const model = createAutomaton(PATTERNS.三角)
  model.growTo(ROWS)
  const past = model.history.slice(0, (ROWS - LIVE_ROWS) * CELLS * 4)
  model.takeControl()
  model.excite(192)
  model.growTo(ROWS + LIVE_ROWS * 2 + 30)
  assert.deepEqual(model.history.subarray(0, past.length), past)
  model.excite(40)
  model.advance()
  assert.ok(model.hasActivity)
})

test('見本の3規則は違う結果になり、10個の種で白が全体の4割を超えない', () => {
  const signatures = new Set<number>()
  for (const options of Object.values(PATTERNS)) {
    for (let seed = 0; seed < 10; seed++) {
      const model = createAutomaton(options, seed * 7919)
      model.growTo(ROWS)
      const count = countWhite(model.history)
      assert.ok(count > 0 && count / (CELLS * ROWS) <= 0.4)
      if (seed === 0) signatures.add(count)
    }
  }
  assert.equal(signatures.size, 3)
})

test('差分で作った縮小画像が全行を一度に作った縮小画像と一致する', () => {
  const model = quiet()
  const update = createMipChain(model.history)
  model.excite(100)
  model.growTo(41)
  update(0, 41)
  model.excite(170)
  model.growTo(117)
  const partial = update(41, 117)
  const complete = createMipChain(model.history)(0, ROWS)
  for (let level = 0; level < partial.length; level++)
    assert.deepEqual(partial[level].data, complete[level].data)
})

test('毎回999行から始まり、履歴を保って約11.2秒で完成する', () => {
  assert.equal(INITIAL_ROWS, 999)
  assert.equal(automaticRows(0), INITIAL_ROWS)
  assert.ok(Math.abs(REMAINING_DURATION - 11.1875) < 1e-10)
  for (let generation = 0; generation < 3; generation++) {
    const seed = SEED + generation * 7919
    const precomputed = createAutomaton(PATTERNS.三角, seed)
    precomputed.growTo(automaticRows(0))
    const sequential = createAutomaton(PATTERNS.三角, seed)
    for (let i = 0; i < INITIAL_ROWS; i++) sequential.advance()
    assert.deepEqual(precomputed.history, sequential.history)
    let previous: number = INITIAL_ROWS
    for (let tick = 0; tick <= ROWS - INITIAL_ROWS; tick++) {
      const row = automaticRows((tick * DURATION) / ROWS)
      assert.ok(row >= previous && row <= ROWS)
      assert.equal(row, INITIAL_ROWS + tick)
      previous = row
    }
    assert.equal(automaticRows(REMAINING_DURATION), ROWS)
    assert.equal(automaticRows(REMAINING_DURATION + 5), ROWS)
  }
})

// WGSLの外唇と同じ半円断面まで含めて投影する。
const lipPoint = (growth: number, v: number, t: number): Vec3 => {
  const p = shellPoint(growth, v, growth)
  const subtract = (a: Vec3, b: Vec3): Vec3 => a.map((x, i) => x - b[i]) as Vec3
  const normalize = (a: Vec3): Vec3 =>
    a.map((x) => x / Math.hypot(...a)) as Vec3
  const dv = subtract(
    shellPoint(growth, v + 0.0001, growth),
    shellPoint(growth, v - 0.0001, growth),
  )
  const dt = subtract(
    shellPoint(growth + 0.0001, v, growth),
    shellPoint(growth - 0.0001, v, growth),
  )
  const n = normalize([
    dt[1] * dv[2] - dt[2] * dv[1],
    dt[2] * dv[0] - dt[0] * dv[2],
    dt[0] * dv[1] - dt[1] * dv[0],
  ])
  const tangent = normalize(dt)
  return p.map(
    (x, i) =>
      x -
      n[i] * 0.012 * growth * (1 - Math.cos(t * Math.PI)) +
      tangent[i] * 0.012 * growth * Math.sin(t * Math.PI),
  ) as Vec3
}

test('距離を保ち、外唇を含む成長中の殻を正面の中央に収める', () => {
  for (const aspect of [1025 / 1753, 0.6, 1, 1.6, 2.4, 2.5]) {
    const frame = frameShell(aspect)
    let initialHeight = 0
    let matureHeight = 0
    for (let step = 0; step <= 20; step++) {
      const progress =
        (INITIAL_ROWS - 1) / (ROWS - 1) +
        ((1 - (INITIAL_ROWS - 1) / (ROWS - 1)) * step) / 20
      const growth = START_SIZE + (1 - START_SIZE) * progress
      const target = followShell(growth, aspect, frame.eye[2])
      const cam = camera(
        [target[0], target[1], frame.eye[2]],
        target,
        Math.PI / 5,
        aspect,
        0.005,
        40,
      )
      const points = []
      for (let j = 0; j <= 256; j++)
        for (let i = 0; i <= 128; i++)
          points.push(
            projectPoint(
              shellPoint(
                START_SIZE + ((growth - START_SIZE) * j) / 256,
                i / 128,
                growth,
              ),
              cam.viewProj,
            ),
          )
      for (let j = 0; j <= 12; j++)
        for (let i = 0; i <= 256; i++)
          points.push(
            projectPoint(lipPoint(growth, i / 256, j / 12), cam.viewProj),
          )
      const minX = Math.min(...points.map((p) => p[0]))
      const maxX = Math.max(...points.map((p) => p[0]))
      const minY = Math.min(...points.map((p) => p[1]))
      const maxY = Math.max(...points.map((p) => p[1]))
      assert.ok(
        Math.abs((minX + maxX) / 4) <= 0.02,
        `横の中心: ${aspect}, ${progress}`,
      )
      assert.ok(
        Math.abs((minY + maxY) / 4) <= 0.02,
        `縦の中心: ${aspect}, ${progress}`,
      )
      assert.ok(minX >= -1 && maxX <= 1 && minY >= -1 && maxY <= 1)
      const height = (maxY - minY) / 2
      if (step === 0) initialHeight = height
      if (step === 20) matureHeight = height
    }
    assert.ok(initialHeight < matureHeight)
    assert.ok(matureHeight <= 0.7)
    if (aspect >= 1) {
      assert.ok(
        initialHeight >= 0.4 && initialHeight <= 0.45,
        `${aspect}: ${initialHeight}`,
      )
      assert.ok(matureHeight >= 0.6)
    }
    console.log(
      `aspect=${aspect.toFixed(3)} height=${(initialHeight * 100).toFixed(2)}% → ${(matureHeight * 100).toFixed(2)}%`,
    )
  }
})

test('三角の見本は連続する20個の種で白が3〜4割になる', () => {
  for (let seed = 0; seed < 20; seed++) {
    const model = createAutomaton(PATTERNS.三角, SEED + seed * 7919)
    model.growTo(ROWS)
    const fraction = countWhite(model.history) / (CELLS * ROWS)
    assert.ok(fraction >= 0.3 && fraction <= 0.4, `${seed}: ${fraction}`)
    const measured = measurePattern(model.history)
    assert.ok(measured.components >= 200, `${seed}: ${measured.components}`)
    assert.ok(measured.small > measured.components / 2, `${seed}: 小が過半数`)
    assert.ok(
      measured.large > 0 && measured.large < measured.components / 6,
      `${seed}: 大は少数`,
    )
  }
})

test('タップ直後の8行でも三角が広がり、途中・完成後の3回の入力が残る', () => {
  for (const start of [INITIAL_ROWS, ROWS]) {
    const model = createAutomaton(PATTERNS.三角)
    model.growTo(start)
    model.takeControl()
    for (const cell of [40, 160, 280]) {
      const from = model.row
      model.excite(cell)
      model.growTo(from + 8)
      for (let step = 0; step < 8; step++) {
        const row = historyRow(from + step)
        for (let x = cell - step - 1; x <= cell + step + 1; x++)
          assert.equal(model.history[(row * CELLS + x) * 4], 255)
      }
      model.growTo(from + 20)
      assert.ok(model.hasActivity)
    }
  }
})

test('縦長・横長の画面で縁の最近傍セルを40 CSS px以内から選ぶ', () => {
  for (const [width, height] of [
    [1025, 1753],
    [1000, 400],
    [800, 500],
  ]) {
    const aspect = width / height
    const frame = frameShell(aspect)
    for (const growth of [0.2, 0.65, 1]) {
      const target = followShell(growth, aspect, frame.eye[2])
      const cam = camera(
        [target[0], target[1], frame.eye[2]],
        target,
        Math.PI / 5,
        aspect,
        0.005,
        40,
      )
      const point = projectPoint(shellPoint(growth, 0.5, growth), cam.viewProj)
      const x = ((point[0] + 1) * width) / 2
      const y = ((1 - point[1]) * height) / 2
      for (const offset of [-39, 0, 39]) {
        const cell = nearestRimCell(
          x + offset,
          y,
          width,
          height,
          growth,
          cam.viewProj,
          CELLS,
        )
        assert.notEqual(cell, undefined)
        const chosen = projectPoint(
          shellPoint(growth, cell! / (CELLS - 1), growth),
          cam.viewProj,
        )
        assert.ok(
          Math.hypot(
            ((chosen[0] + 1) * width) / 2 - x - offset,
            ((1 - chosen[1]) * height) / 2 - y,
          ) <= 40,
        )
      }
      assert.equal(
        nearestRimCell(-100, -100, width, height, growth, cam.viewProj, CELLS),
        undefined,
      )
    }
  }
})

test('縁のいちばん右から40pxまでは選び、40pxを超えた所は選ばない', () => {
  const width = 1000
  const height = 400
  const frame = frameShell(width / height)
  const cam = camera(
    frame.eye,
    frame.target,
    Math.PI / 5,
    width / height,
    0.005,
    40,
  )
  const rim = Array.from({ length: CELLS }, (_, i) => {
    const p = projectPoint(shellPoint(1, i / (CELLS - 1), 1), cam.viewProj)
    return {
      cell: i,
      x: ((p[0] + 1) * width) / 2,
      y: ((1 - p[1]) * height) / 2,
    }
  })
  const right = rim.reduce((a, b) => (a.x > b.x ? a : b))
  for (const distance of [39.99, 40, 40.01, 60]) {
    const selected = nearestRimCell(
      right.x + distance,
      right.y,
      width,
      height,
      1,
      cam.viewProj,
      CELLS,
    )
    assert.equal(selected, distance <= 40 ? right.cell : undefined)
  }
})
