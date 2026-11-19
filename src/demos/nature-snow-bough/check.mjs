import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// Node でも、Astro 向けの拡張子なしの TypeScript import をそのまま読めるようにする。
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.'))
        return nextResolve(`${specifier}.ts`, context)
      throw error
    }
  },
})
const { makeScene, POINT_STRIDE, SNOW_STRIDE, STEP } = await import(
  './scene.ts'
)
const { startDrag, dragGrip } = await import('./dragging.ts')
const { pickBranch, PICK_RADIUS } = await import('./picking.ts')
const { projectToScreen, screenToWorld, viewForSize } = await import(
  './projection.ts'
)
const { snowShape, snowVolume } = await import('./snow-shape.ts')
const { FIELDS, BoughPhysics } = await import('./physics.ts')
const { renderShader } = await import('./render.ts')
const { createUniform } = await import('../../shared/gpu/uniform.ts')
let checks = 0
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`)
const sizes = [
  [1280, 800],
  [1025, 1753],
  [1440, 450],
  [1025, 400],
  [768, 500],
  [390, 844],
  [599, 400],
  [600, 500],
]
for (const [width, height] of sizes) {
  const scene = makeScene(width < 600)
  const view = viewForSize(width, height)
  const bounds = { left: 37, top: 83, width, height }
  const snow = new Float32Array(scene.snows.length * SNOW_STRIDE)
  for (const bent of [false, true]) {
    const nodes = scene.nodes.slice()
    if (bent) {
      for (let id = 2; id < scene.branchCount; id++) {
        const at = id * POINT_STRIDE
        nodes[at + 1] -= 0.8 + id * 0.013
        nodes[at + 2] += Math.sin(id) * 0.7
        nodes[at + 5] -= 0.6
      }
    }
    for (const interpolation of [0, 0.5, 1]) {
      for (let id = 0; id < scene.branchCount; id++) {
        const at = id * POINT_STRIDE
        const world = [0, 1, 2].map(
          (k) =>
            nodes[at + 4 + k] * (1 - interpolation) +
            nodes[at + k] * interpolation,
        )
        // シェーダーの NDC → viewport の式から独立に期待する画面位置を作る。
        const ndc = [
          (world[0] + world[2] * 0.1 - view[0]) / view[2],
          (world[1] + world[2] * 0.06 - view[1]) / view[3],
        ]
        const screen = [
          bounds.left + ((ndc[0] + 1) * width) / 2,
          bounds.top + ((1 - ndc[1]) * height) / 2,
        ]
        const projected = projectToScreen(world, view, bounds)
        projected.forEach((v, k) => close(v, screen[k]))
        const back = screenToWorld(screen, view, bounds)
        close(back[0], world[0] + world[2] * 0.1)
        close(back[1], world[1] + world[2] * 0.06)
        for (let direction = 0; direction < 9; direction++) {
          const angle = (direction * Math.PI) / 4
          const radius = direction === 8 ? 0 : PICK_RADIUS
          const input = [
            screen[0] + Math.cos(angle) * radius,
            screen[1] + Math.sin(angle) * radius,
          ]
          const picked = pickBranch(
            scene,
            nodes,
            snow,
            input,
            view,
            bounds,
            interpolation,
          )
          assert.ok(
            picked >= 0,
            `${width}x${height}, bent=${bent}, interpolation=${interpolation}, id=${id}, direction=${direction}`,
          )
          checks++
        }
      }
    }
    assert.equal(
      pickBranch(scene, nodes, snow, [-10000, -10000], view, bounds),
      -1,
    )
  }
  // 雪の投影内からも、その雪を支える枝をつかめる。
  scene.snows.forEach((patch, i) => {
    snow.fill(0)
    snow[i * SNOW_STRIDE + 8] = 1
    snow[i * SNOW_STRIDE + 11] = 1
    const p = projectToScreen(patch.center, view, bounds)
    const picked = pickBranch(scene, scene.nodes, snow, p, view, bounds)
    assert.equal(picked, patch.anchor)
  })
}
// 24px の境界の外まで広がっていないことを、雪のない孤立した枝で確かめる。
const source = makeScene(false)
const isolated = {
  ...source,
  paths: [[2, 3]],
  segments: new Uint32Array([2, 3, 0, 2 | (3 << 8) | (2 << 16) | (3 << 24)]),
  snows: [],
}
const bounds = { left: 0, top: 0, width: 1025, height: 1753 },
  view = viewForSize(bounds.width, bounds.height)
const a = projectToScreen(Array.from(source.nodes.slice(40, 43)), view, bounds)
const b = projectToScreen(Array.from(source.nodes.slice(60, 63)), view, bounds)
const span = Math.hypot(b[0] - a[0], b[1] - a[1])
for (const radius of [24, 24.01]) {
  const position = [
    (a[0] + b[0]) / 2 - ((b[1] - a[1]) / span) * radius,
    (a[1] + b[1]) / 2 + ((b[0] - a[0]) / span) * radius,
  ]
  assert.equal(
    pickBranch(
      isolated,
      source.nodes,
      new Float32Array(),
      position,
      view,
      bounds,
    ) >= 0,
    radius === 24,
  )
}
for (const phase of [-2, 0, 1.7]) {
  for (const u of [-1, -0.5, 0, 0.5, 1])
    for (const w of [-1, -0.5, 0, 0.5, 1]) {
      assert.ok(snowShape(u, -1, w, phase)[1] >= 0)
      assert.ok(snowShape(u, 1, w, phase)[1] > 0.2)
      assert.ok(
        snowShape(u, 1, w, phase, 1, 0.6)[1] < snowShape(u, 1, w, phase)[1],
      )
    }
  const tip = snowShape(1, 1, 0, phase)
  assert.ok(tip[1] > 0.4, 'rounded end must keep a substantial snow cap')
  let last = 0
  for (let i = 0; i <= 40; i++) {
    const volume = snowVolume(phase, i / 40)
    assert.ok(volume >= last)
    last = volume
  }
  assert.ok(snowVolume(phase, 0.1) < snowVolume(phase) * 0.02)
  assert.ok(Math.abs(snowShape(1, 1, 1, phase, 0.1)[0]) < 0.35)
}
// 四つの塊の上面は同じ帯の厚みを読み、境目に段差を作らない。
for (let band = 0; band < 3; band++)
  for (let part = 0; part < 3; part++)
    for (const w of [-1, -0.7, 0, 0.7, 1]) {
      const a = snowShape(1, 1, w, band * 4 + part)
      const b = snowShape(-1, 1, w, band * 4 + part + 1)
      close(a[1], b[1])
      close(a[2], b[2])
      assert.ok(Math.abs(a[0] - b[0] - 2) < 0.005)
    }
const rimTop = snowShape(0, 1, 1, 1)
const rimMiddle = snowShape(0, 0, 1, 1)
const rimBottom = snowShape(0, -1, 1, 1)
assert.ok(
  rimMiddle[2] > rimTop[2] && rimMiddle[2] > rimBottom[2],
  'rim must curl in above and below its widest point',
)
assert.ok(snowShape(0, 1, 0, 1)[1] > rimTop[1], 'crown must rise above the rim')
// JS の書き込み位置と WGSL が読む項目名を確かめる。GPU は呼ばない。
Reflect.set(globalThis, 'GPUBufferUsage', { UNIFORM: 64, COPY_DST: 8 })
let uploaded
const uniform = createUniform(
  {
    createBuffer: (options) => options,
    queue: {
      writeBuffer: (_buffer, _offset, data) => {
        uploaded = data.slice(0)
      },
    },
  },
  'Bough',
  FIELDS,
)
assert.equal(uniform.buffer.size, 80)
uniform.set({
  view: [1, 2, 3, 4],
  grip: [5, 6, 7, 8],
  dt: 0.125,
  gripEdge: 23,
  gripT: 0.375,
  interpolation: 0.5,
})
uniform.upload()
assert.equal(new Float32Array(uploaded)[8], 0.125)
assert.equal(new Float32Array(uploaded)[17], 0.5)
assert.equal(new Uint32Array(uploaded)[18], 23)
assert.equal(new Float32Array(uploaded)[19], 0.375)
for (const shader of [renderShader(uniform.wgsl)]) {
  for (const match of shader.matchAll(/\bu\.([a-zA-Z]\w*)/g))
    assert.ok(match[1] in FIELDS, match[1])
}
console.log(
  `PASS: ${sizes.length} viewport sizes; ${checks} branch picks (including 24px); snow shape and 80-byte uniform checks`,
)

const { Rod, rigidity, rotation, product, apply, sub, dot } = await import(
  './rod.ts'
)
const rotationDegrees = (a, b) =>
  (Math.acos(
    Math.max(
      -1,
      Math.min(
        1,
        (a.flat().reduce((s, v, k) => s + v * b.flat()[k], 0) - 1) / 2,
      ),
    ),
  ) *
    180) /
  Math.PI
const newBeam = () => {
  const count = 12,
    length = 3,
    radius = 0.05
  const rod = new Rod(
    Array.from({ length: count + 1 }, (_, i) => [(length * i) / count, 0, 0]),
    Array.from({ length: count }, (_, i) => [i, i + 1]),
    Array(count).fill(radius),
  )
  rod.nodeMass.fill(0.001)
  return rod
}
let beamError = 0
for (const direction of [1, 2]) {
  const rod = newBeam(),
    force = [0, 0, 0]
  force[direction] = -0.01
  for (let i = 0; i < 1800; i++)
    rod.step(
      STEP,
      [{ edge: 11, t: 1, offset: [0, 0, 0], mass: 0.01, force }],
      [0, 0, 0],
    )
  const expected = (0.01 * 3 ** 3) / (3 * rigidity(0.05).bending)
  const error = Math.abs(-rod.positions[12][direction] / expected - 1)
  assert.ok(error < 0.05, `cantilever error ${error}`)
  beamError = Math.max(beamError, error)
}
const twisted = newBeam()
twisted.q[4 * 3] = 0.2
twisted.update()
assert.ok(twisted.energy() > 0.01)
const initialEnergy = twisted.energy(),
  before = twisted.positions.map((p) => p.slice()),
  globalRotation = rotation([0.4, -0.7, 0.2])
twisted.root = apply(globalRotation, twisted.root)
twisted.edges.forEach((e) => {
  e.restFrame = product(globalRotation, e.restFrame)
})
twisted.update()
close(twisted.energy(), initialEnergy)
twisted.positions.forEach((p, i) =>
  p.forEach((v, k) => close(v, apply(globalRotation, before[i])[k])),
)
const freeTwist = twisted.energy()
for (let i = 0; i < 240; i++) twisted.step(STEP, [], [0, 0, 0])
assert.ok(
  twisted.energy() < freeTwist * 0.01,
  'twist must restore instead of remaining a free rotation',
)
console.log(
  `PASS stage 1: two bending directions, beam error ${(beamError * 100).toFixed(4)}%; twist restores; energy and positions covary under rigid rotation`,
)

const warm = (compact = false) => {
  const p = new BoughPhysics(makeScene(compact))
  p.input.settling = 1
  p.input.renew = 0
  for (let i = 0; i < 720; i++) p.step()
  p.input.settling = 0
  return p
}
let maxDrift = 0,
  minHeight = Infinity,
  maxLengthError = 0
const inspectSupports = (p) => {
  p.chunks.forEach((c, i) => {
    if (!c.attached) return
    const s = p.scene.snows[i],
      normal = p.rod.frames[s.edge][1],
      axis = p.rod.site(s.edge, s.t)
    assert.ok(
      dot(c.basis[1], normal) > 0.8,
      'attached snow rolled below its support',
    )
    for (let n = 0; n < 100; n++) {
      const point = Array.from(
        p.nodes.slice((s.start + n) * 20, (s.start + n) * 20 + 3),
      )
      const h = dot(sub(point, axis), normal)
      minHeight = Math.min(minHeight, h)
      assert.ok(h > 0, 'attached snow crossed below the branch axis')
    }
  })
}
for (const compact of [false, true]) {
  const p = warm(compact),
    frames = p.rod.frames.map((f) => f.map((v) => v.slice()))
  for (let i = 0; i < 4800; i++) {
    p.step()
    if (i % 120 === 0) inspectSupports(p)
    p.rod.edges.forEach((e) => {
      maxLengthError = Math.max(
        maxLengthError,
        Math.abs(
          Math.hypot(...sub(p.rod.positions[e.a], p.rod.positions[e.b])) -
            e.length,
        ),
      )
    })
  }
  const drift = Math.max(
    ...p.rod.frames.map((f, i) => rotationDegrees(f, frames[i])),
  )
  maxDrift = Math.max(maxDrift, drift)
  assert.ok(drift < 1)
  assert.ok(p.chunks.every((c) => c.attached))
}
console.log(
  `PASS stage 1/2: 40s after 6s warmup, desktop + compact, drift ${maxDrift.toFixed(6)} deg; snow above axis by >=${minHeight.toFixed(5)}; rod length error ${maxLengthError.toExponential(2)}`,
)

// 実際の pointerdown/move と同じ入口を通す。100px は 1.125 場面単位。
const pullPixels = (pixels, seconds, eventHz = 60, edge = 9) => {
  const p = warm(),
    bounds = { left: 0, top: 0, width: 1280, height: 800 }
  const view = viewForSize(bounds.width, bounds.height)
  p.input.view = view
  const screen = projectToScreen(p.rod.site(edge, 0.75), view, bounds)
  const drag = startDrag(p.scene, p.nodes, p.snow, screen, view, bounds)
  assert.ok(drag)
  assert.equal(
    drag.edge,
    edge,
    'test must grab the main branch, not a nearby twig',
  )
  p.input.gripOn = 1
  p.input.gripEdge = drag.edge
  p.input.gripT = drag.t
  const frames = Math.round(seconds * eventHz),
    stepsPerFrame = 120 / eventHz
  let atRelease = 0
  for (let frame = 0; frame < frames; frame++) {
    p.input.grip = dragGrip(
      drag,
      [screen[0], screen[1] + (pixels * (frame + 1)) / frames],
      view,
      bounds,
    )
    for (let step = 0; step < stepsPerFrame; step++) {
      p.step()
      inspectSupports(p)
    }
  }
  const displacement = p.input.grip[1] - drag.origin[1]
  close(displacement, -Math.min((pixels * 14.4) / 1280, 2.8))
  atRelease = p.chunks.filter((c) => !c.attached).length
  p.input.gripOn = 0
  for (let i = 0; i < 480; i++) {
    p.step()
    inspectSupports(p)
  }
  const detached = p.chunks.flatMap((c, i) => (c.attached ? [] : [i]))
  console.log(
    `PIXELS ${pixels}px/${seconds}s @${eventHz}Hz, main edge ${edge}, grab=(${screen.map((v) => v.toFixed(1)).join(',')}), world=${(-displacement).toFixed(4)}, detached=${detached.length}/12 (before release ${atRelease}); ids=${detached.join(',')}`,
  )
  assert.ok(p.rod.q.every(Number.isFinite))
  return { p, detached, atRelease }
}
for (const eventHz of [60, 120]) {
  assert.equal(pullPixels(30, 0.5, eventHz).detached.length, 0)
  const gentle = pullPixels(100, 0.5, eventHz)
  assert.ok(gentle.detached.length >= 1 && gentle.detached.length <= 2)
  assert.ok(
    gentle.detached.every((i) => pTip(gentle.p, i)),
    'gentle pull should shed a distal chunk',
  )
  const middle = pullPixels(160, 0.5, eventHz)
  assert.ok(middle.detached.length > gentle.detached.length)
  for (const [pixels, seconds] of [
    [220, 0.2],
    [290, 0.12],
  ]) {
    const strong = pullPixels(pixels, seconds, eventHz)
    assert.ok(
      strong.detached.length >= 8,
      'strong main pull should shed most snow',
    )
    for (const band of [1, 2])
      assert.ok(
        strong.detached.filter((i) => strong.p.scene.snows[i].band === band)
          .length >= 2,
        'main motion must shed snow from each twig',
      )
    assert.ok(strong.p.bonds.some((b) => !b.intact))
  }
}
function pTip(p, i) {
  return i % 4 >= 2 && p.scene.snows[i].band > 0
}
console.log(
  'PASS screen-input shedding: weak / moderate / strong pulls at two pointer event rates',
)

// 雪を載せた場合と載せない場合を同じ棒でならし、小枝のたわみを比較する。
const loaded = warm(),
  bare = new BoughPhysics(makeScene(false))
bare.chunks.forEach((c) => {
  c.mass = 0
})
bare.input.settling = 1
bare.input.renew = 0
for (let i = 0; i < 720; i++) bare.step()
for (const path of loaded.scene.paths.slice(1)) {
  const angle = (p) => {
    const delta = sub(p.rod.positions[path.at(-1)], p.rod.positions[path[0]])
    return (Math.atan2(delta[1], delta[0]) * 180) / Math.PI
  }
  const withSnow = angle(loaded),
    withoutSnow = angle(bare)
  assert.ok(
    withSnow < 0 && withSnow > -25,
    `twig must rest slightly downward: ${withSnow}`,
  )
  assert.ok(
    withSnow < withoutSnow - 0.1,
    `snow load must add sag: ${withSnow} vs ${withoutSnow}`,
  )
  console.log(
    `PASS twig equilibrium: loaded=${withSnow.toFixed(2)}deg, bare=${withoutSnow.toFixed(2)}deg`,
  )
}

const falling = warm(),
  body = falling.chunks[0]
const massBefore = body.mass,
  velocityBefore = body.velocity.slice(),
  spinBefore = body.spin.slice()
falling.release(0)
close(body.mass, massBefore)
body.velocity.forEach((v, k) => close(v, velocityBefore[k]))
body.spin.forEach((v, k) => close(v, spinBefore[k]))
// 支持面の幅から外して自由落下させる。破断そのものには速度を足さない。
body.origin[2] += 1
body.com[2] += 1
body.velocity = [0, 0, 0]
let lastMass = body.mass,
  framesVisible = 0
for (let i = 0; i < 600 && !body.sleeping; i++) {
  falling.step()
  assert.equal(body.attached, false)
  assert.ok(body.mass <= lastMass + 1e-10)
  assert.ok(
    body.mass > massBefore * 0.1,
    'core vanished before the screen bottom',
  )
  lastMass = body.mass
  framesVisible++
}
assert.ok(body.sleeping)
assert.ok(body.origin[1] < falling.input.view[1] - falling.input.view[3] - 1)
assert.ok(body.erosion > 0.2)
close(body.mass + falling.shedMass, massBefore)
// 切れた付着は支持面の下から引き上げない。
const below = warm(),
  belowBody = below.chunks[0]
below.release(0)
belowBody.origin[1] -= 2
belowBody.com[1] -= 2
belowBody.velocity = [0, 0, 0]
const oldY = belowBody.com[1]
below.step()
assert.ok(belowBody.com[1] < oldY)
console.log(
  `PASS stage 3/4: release preserves mass and linear/angular velocity; eroding core reaches screen bottom in ${(framesVisible * STEP).toFixed(3)}s, remaining mass ${((body.mass / massBefore) * 100).toFixed(1)}%; no attraction from below`,
)

const growth = warm()
const rodBefore = growth.rod.q.slice()
growth.renew()
assert.deepEqual(growth.rod.q, rodBefore)
assert.ok(growth.chunks.every((c) => c.mass === 0 && c.growth === 0))
growth.input.renew = 1
let lastGrowthMass = 0,
  maxVolumeError = 0
for (let i = 0; i < 420; i++) {
  growth.step()
  const c = growth.chunks[0],
    s = growth.scene.snows[0]
  assert.ok(c.mass >= lastGrowthMass - 1e-10)
  lastGrowthMass = c.mass
  const exact = (s.mass * snowVolume(s.phase, c.growth)) / snowVolume(s.phase)
  maxVolumeError = Math.max(maxVolumeError, Math.abs(c.mass - exact) / s.mass)
}
assert.ok(growth.chunks.every((c) => c.growth > 0.999))
assert.ok(maxVolumeError < 0.002)
growth.renew()
growth.input.gripOn = 1
const site = growth.rod.site(0, 0)
growth.input.gripEdge = 0
growth.input.gripT = 0
growth.input.grip = [site[0], site[1], 0, 0]
for (let i = 0; i < 60; i++) growth.step()
assert.ok(growth.chunks.every((c) => c.growth === 0 && c.mass === 0))
const restart = warm()
restart.chunks.forEach((c) => {
  c.attached = false
  c.sleeping = true
})
restart.input.renew = 1
for (let i = 0; i < 479; i++) restart.step()
assert.ok(restart.chunks.every((c) => c.sleeping))
for (let i = 0; i < 3; i++) restart.step()
assert.ok(restart.chunks.every((c) => c.attached && c.growth < 0.01))
console.log(
  `PASS stage 5: 4s wait + 3.5s deposition, no pose reset, volume/mass error <=${(maxVolumeError * 100).toFixed(4)}% of full mass; grabbing pauses growth`,
)

// WGSL の型の並びと binding は、ブラウザへ接続せずに JS 側と照合する。
const shader = renderShader(uniform.wgsl)
const { STRUCTS } = await import('./physics.ts')
for (const [name, bytes] of [
  ['Point', POINT_STRIDE * 4],
  ['Snow', SNOW_STRIDE * 4],
  ['Powder', 32],
]) {
  const body = (STRUCTS + shader).match(
    new RegExp(`struct ${name} \\{([^}]+)\\}`),
  )[1]
  const fields = [...body.matchAll(/\w+: vec4f/g)]
  assert.equal(fields.length * 16, bytes)
}
const bindings = [...shader.matchAll(/@group\((\d)\) @binding\((\d)\)/g)].map(
  (m) => `${m[1]}:${m[2]}`,
)
assert.deepEqual(bindings, [
  '0:0',
  '0:1',
  '0:2',
  '0:3',
  '0:4',
  '0:5',
  '1:0',
  '1:1',
])
// https://www.w3.org/TR/2026/CRD-WGSL-20261106/#reserved-words
const reserved = new Set(
  'NULL Self _ abstract active alignas alignof as asm asm_fragment async attribute auto await become cast catch class co_await co_return co_yield coherent column_major common compile compile_fragment concept const_cast consteval constexpr constinit crate debugger decltype delete demote demote_to_helper do dynamic_cast enum explicit export extends extern external fallthrough filter final finally friend from fxgroup get goto groupshared highp impl implements import inline instanceof interface layout lowp macro macro_rules match mediump meta mod module move mut mutable namespace new nil noexcept noinline nointerpolation non_coherent noncoherent noperspective null nullptr of operator package packoffset partition pass patch pixelfragment precise precision premerge priv protected pub public readonly ref regardless register reinterpret_cast require resource restrict self set shared sizeof smooth snorm static static_assert static_cast std subroutine super target template this thread_local throw trait try type typedef typeid typename typeof union unless unorm unsafe unsized use using varying virtual volatile wgsl where with writeonly yield'.split(
    ' ',
  ),
)
const tokens = shader
  .replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')
  .match(/\b[A-Za-z_]\w*\b/g)
for (const token of tokens)
  assert.ok(!reserved.has(token), `reserved WGSL token: ${token}`)
console.log(
  'PASS shader contract: 80-byte uniform; Point=80, Snow=192, Powder=32 bytes; eight bindings; no reserved WGSL words',
)

let minimumJacobian = Infinity
for (const phase of makeScene(false).snows.map((s) => s.phase))
  for (const erosion of [0, 0.4, 0.8]) {
    for (let x = 0; x <= 40; x++)
      for (let z = 0; z <= 40; z++) {
        const u = x / 20 - 1,
          w = z / 20 - 1,
          epsilon = 0.00001
        const p = snowShape(u, 1, w, phase, 1, erosion),
          a = snowShape(u + epsilon, 1, w, phase, 1, erosion),
          b = snowShape(u, 1, w + epsilon, phase, 1, erosion)
        const jacobian =
          ((a[0] - p[0]) * (b[2] - p[2]) - (a[2] - p[2]) * (b[0] - p[0])) /
          epsilon ** 2
        minimumJacobian = Math.min(minimumJacobian, jacobian)
        assert.ok(jacobian > 0, 'snow surface folded over during erosion')
      }
  }
console.log(
  `PASS stage 4 geometry: no folded surface in 60,516 samples; minimum footprint Jacobian ${minimumJacobian.toFixed(4)}`,
)

// storage buffer の断面と姿勢から、描画と同じ点を復元できることを確かめる。
const contract = warm()
for (let i = 0; i < 10; i++) contract.step()
for (const [i, s] of contract.scene.snows.entries())
  for (const previous of [false, true]) {
    const offset = i * SNOW_STRIDE,
      base = offset + (previous ? 32 : 16)
    const origin = Array.from(contract.snow.slice(base, base + 3))
    const axes = Array.from({ length: 3 }, (_, axis) =>
      Array.from(contract.snow.slice(base + 4 + axis * 4, base + 7 + axis * 4)),
    )
    for (let n = 0; n < 100; n++) {
      const x = n % 5,
        y = Math.floor(n / 5) % 4,
        z = Math.floor(n / 20)
      const q = snowShape(x / 2 - 1, y / 1.5 - 1, z / 2 - 1, s.phase)
      const expected = origin.map(
        (v, k) =>
          v +
          axes.reduce((sum, axis, a) => sum + axis[k] * q[a] * s.size[a], 0),
      )
      const node = (s.start + n) * POINT_STRIDE + (previous ? 4 : 0)
      expected.forEach((v, k) =>
        assert.ok(Math.abs(v - contract.nodes[node + k]) < 1e-5),
      )
    }
  }
assert.equal(rigidity(0.1).bending / rigidity(0.05).bending, 16)
assert.equal(rigidity(0.1).torsion / rigidity(0.05).torsion, 16)
console.log(
  'PASS storage poses: current and previous GPU poses match 2,400 CPU snow points; bending/torsion scale as radius^4',
)

// 核が眠った後も煙は独立して漂い、有限の時間で消える。
const { SnowPowder } = await import('./snow-powder.ts')
const powder = new SnowPowder(1)
const smokePose = new Float32Array(SNOW_STRIDE)
smokePose[8] = 1
powder.advance(smokePose, 1 / 60)
assert.ok([0, 1, 2].every((i) => powder.data[i * 8 + 3] < 0))
smokePose[8] = 0
smokePose[9] = 0.16
smokePose[17] = 1
smokePose[33] = 1
powder.advance(smokePose, 1 / 60)
assert.ok([0, 1, 2].every((i) => powder.data[i * 8 + 3] > 0))
smokePose[10] = 1
powder.advance(smokePose, 0.5)
assert.ok(powder.data[3] > 0.5 && powder.data[1] < 1)
for (let i = 0; i < 180; i++) powder.advance(smokePose, 1 / 60)
assert.ok([0, 1, 2].every((i) => powder.data[i * 8 + 3] < 0))
powder.reset()
assert.ok(powder.data.every((value, i) => value === (i % 8 === 3 ? -1 : 0)))
console.log(
  'PASS powder: three cards per chunk, independent drift after core sleeps, fade and reset',
)

// 場所と時間を指定した三つの操作。破断数だけでなく、支持と受け渡しを検査する。
const { add, mul, transpose } = await import('./rod.ts')
const { ContactResponse } = await import('./contact.ts')
for (const eventHz of [60, 120]) {
  for (const [pixels, seconds] of [
    [150, 0.4],
    [100, 1.5],
    [250, 0.2],
  ]) {
    const p = warm(),
      bounds = { left: 0, top: 0, width: 1280, height: 800 }
    const view = viewForSize(1280, 800)
    const drag = startDrag(p.scene, p.nodes, p.snow, [1000, 450], view, bounds)
    assert.ok(drag)
    Object.assign(p.input, {
      view,
      gripOn: 1,
      gripEdge: drag.edge,
      gripT: drag.t,
    })
    let previousCom,
      previousBasis,
      maxGap = 0,
      velocityError = 0,
      spinError = 0,
      maxPenetration = 0
    let releases = 0,
      maxUp = 0,
      beforeRelease = 0,
      spread = 0,
      spinSpread = 0
    const release = p.release.bind(p)
    p.release = (i) => {
      const c = p.chunks[i]
      if (!c.attached) return release(i)
      const expected = mul(sub(c.com, previousCom[i]), 1 / STEP)
      velocityError = Math.max(
        velocityError,
        Math.hypot(...sub(expected, c.velocity)),
      )
      const reconstructed = product(
        rotation(mul(c.spin, STEP)),
        previousBasis[i],
      )
      spinError = Math.max(spinError, rotationDegrees(reconstructed, c.basis))
      const velocity = c.velocity.slice(),
        spin = c.spin.slice(),
        mass = c.mass
      release(i)
      assert.deepEqual(c.velocity, velocity)
      assert.deepEqual(c.spin, spin)
      close(c.mass, mass)
      releases++
    }
    const pullSteps = Math.round(seconds / STEP)
    for (let k = 0; k < pullSteps + 300; k++) {
      const eventStep = 120 / eventHz
      if (k < pullSteps)
        p.input.grip = dragGrip(
          drag,
          [
            1000,
            450 +
              pixels *
                Math.min(
                  1,
                  ((Math.floor(k / eventStep) + 1) * eventStep) / pullSteps,
                ),
          ],
          view,
          bounds,
        )
      else p.input.gripOn = 0
      previousCom = p.chunks.map((c) => c.com.slice())
      previousBasis = p.chunks.map((c) => c.basis.map((v) => v.slice()))
      p.step()
      if (k === pullSteps - 1)
        beforeRelease = p.chunks.filter((c) => !c.attached).length
      const free = p.chunks.filter((c) => !c.attached && !c.sleeping)
      if (free.length > 2) {
        const speeds = free.map((c) => Math.hypot(...c.velocity))
        const spins = free.map((c) => Math.hypot(...c.spin))
        spread = Math.max(spread, Math.max(...speeds) - Math.min(...speeds))
        spinSpread = Math.max(
          spinSpread,
          Math.max(...spins) - Math.min(...spins),
        )
      }
      p.chunks.forEach((c, i) => {
        assert.ok(c.velocity.every(Number.isFinite))
        assert.ok(
          Math.hypot(...c.velocity) < 30,
          'contact response injected excessive energy',
        )
        const s = p.scene.snows[i]
        if (c.attached) {
          const expected = add(
            p.support(i),
            apply(p.rod.frames[s.edge], c.local),
          )
          maxGap = Math.max(
            maxGap,
            Math.hypot(...sub(c.origin, expected)),
            Math.abs(c.local[1]),
          )
          assert.ok(rotationDegrees(c.basis, p.rod.frames[s.edge]) < 0.00001)
          return
        }
        if (k >= pullSteps) maxUp = Math.max(maxUp, c.velocity[1])
        if (c.sleeping) return
        // 独立に枝軸を標本化し、雪の核を通過していないことを見る。
        // 包絡箱の角・SDF の浅い凹凸との誤差は核の外へ除く。
        const half = [
          s.size[0] * 0.9,
          s.size[1] * c.growth * 0.42,
          s.size[2] * 0.8,
        ].map((v) => v * (1 - c.erosion * 0.2))
        for (const e of p.rod.edges)
          for (let n = 0; n <= 12; n++) {
            const point = add(
              p.rod.positions[e.a],
              mul(sub(p.rod.positions[e.b], p.rod.positions[e.a]), n / 12),
            )
            const local = apply(transpose(c.basis), sub(point, c.com))
            const depths = local.map((v, axis) => half[axis] - Math.abs(v))
            if (depths.every((v) => v > 0))
              maxPenetration = Math.max(maxPenetration, Math.min(...depths))
          }
      })
    }
    assert.ok(maxGap < 1e-8)
    assert.ok(velocityError < 1e-8)
    assert.ok(spinError < 0.0001)
    assert.ok(
      maxPenetration < 0.012,
      `branch entered snow core by ${maxPenetration}`,
    )
    if (pixels === 100) {
      assert.equal(beforeRelease, 0, 'slow pull must keep its snow')
      assert.equal(releases, 0)
    } else {
      assert.ok(releases >= 6)
      assert.ok(
        maxUp > 0.3,
        'rebounding branch must launch detached snow upward',
      )
      assert.ok(p.contacts > 0)
      assert.ok(
        spread > 0.3 && spinSpread > 0.5,
        'falling chunks must separate in speed and spin',
      )
    }
    console.log(
      `PASS snow ${pixels}px/${seconds}s @${eventHz}Hz: support gap=${maxGap.toExponential(2)}, release velocity error=${velocityError.toExponential(2)}, spin error=${spinError.toExponential(2)}deg; releases=${releases} (${beforeRelease} while pulling), contacts=${p.contacts}, core penetration=${maxPenetration.toFixed(5)}, upward=${maxUp.toFixed(3)}, speed/spin spread=${spread.toFixed(3)}/${spinSpread.toFixed(3)}`,
    )
  }
}
// 一本の枝が一刻みで雪全体を横切る負荷。元の支持区間以外でも上下左右から当たる。
for (let axis = 0; axis < 3; axis++)
  for (const sign of [-1, 1]) {
    const p = warm(),
      c = p.chunks[0],
      s = p.scene.snows[0]
    p.release(0)
    c.com = [0, 0, 0]
    c.basis = rotation([0, 0, 0])
    c.velocity = [0, 0, 0]
    c.spin = [0, 0, 0]
    const along = (axis + 1) % 3
    const a = [0, 0, 0],
      b = [0, 0, 0]
    a[axis] = b[axis] = -sign
    a[along] = -1
    b[along] = 1
    const endA = a.slice(),
      endB = b.slice()
    endA[axis] = endB[axis] = sign
    const before = [{ a, b, radius: 0.025, edge: 0, needle: false }]
    const after = [{ ...before[0], a: endA, b: endB }]
    p.fall(
      0,
      before,
      after,
      new ContactResponse(p.rod, [], STEP),
      [0, 0, 0],
      STEP,
    )
    assert.ok(p.contacts > 0)
    assert.ok(
      Math.hypot(...c.com) > 0.2,
      'swept contact did not displace the snow',
    )
    const half = [s.size[0] * 0.96, s.size[1] * 0.44, s.size[2] * 0.85]
    // 雪が端へ転がって逃げる解も許す。線分全体と回転後の箱の隔たりを標本化する。
    for (let n = 0; n <= 200; n++) {
      const point = add(endA, mul(sub(endB, endA), n / 200))
      const local = apply(transpose(c.basis), sub(point, c.com))
      const distance = Math.hypot(
        ...local.map((v, k) => Math.max(0, Math.abs(v) - half[k])),
      )
      assert.ok(
        distance > 0.023,
        `swept branch entered snow: axis=${axis}, sign=${sign}, distance=${distance}`,
      )
    }
  }
console.log(
  'PASS swept contact: a branch crosses two world units in one 1/120s step, all six directions',
)
