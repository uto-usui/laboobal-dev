import GUI from 'lil-gui'
import { loop, onResize, pixelRatio } from '../../shared/dom'
import {
  bindBuffers,
  createGpu,
  type Gpu,
  pingPong,
  storageBuffer,
  Unsupported,
} from '../../shared/gpu/device'
import { fixedStepper } from '../../shared/gpu/stepper'
import { createUniform } from '../../shared/gpu/uniform'
import { onReducedMotion } from '../../shared/motion'
import { touchGate } from '../../shared/touch'
import {
  acceptsPointer,
  createBreathInput,
  createRenewal,
  detachSeeds,
  rootDirection,
  selectNearbySeeds,
  type Stroke,
  variation,
} from './interaction'
import {
  advect,
  COUNT,
  divergence,
  FIELD,
  FIELDS,
  jacobi,
  landscape,
  PARTS,
  projectWind,
  scene,
  seeds,
  simulate,
} from './shaders'

const stage = document.querySelector<HTMLElement>('.nature-dandelion')!
const canvas = stage.querySelector<HTMLCanvasElement>('.view')!
const errorBox = stage.querySelector<HTMLElement>('.error')!
let failed = false
const showError = (message: string) => {
  failed = true
  errorBox.textContent = message
  errorBox.hidden = false
  console.error(message)
}

const MAX_FLYING = 20
const LIFETIME = 17
const IDLE_SECONDS = 4
const PRESSURE_ITERATIONS = 36
const P = { breeze: 1, breath: 1, focus: 1.9, light: 1.1 }
const start = async (gpu: Gpu) => {
  const { device, context, format } = gpu
  const U = createUniform(device, 'Dandelion', FIELDS)
  const rect = stage.getBoundingClientRect()
  let width = Math.max(1, rect.width)
  let height = Math.max(1, rect.height)
  let aspect = width / height
  let time = 0
  let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  let dirty = true
  let landscapeDirty = true
  let breathStrength = 0
  let breathPosition = [0, 0]
  let breathVelocity = [0, 0, 0]
  let pointerInside = false
  let idleAfter = 0
  let touchStart:
    | { id: number; x: number; y: number; accepted: boolean }
    | undefined
  let nextRelease = 1.5
  let releaseSerial = 0
  const renewal = createRenewal(COUNT)
  const breathInput = createBreathInput()
  let headY = -0.27
  let headAlpha = 1
  const headX = () => -Math.min(0.38, aspect * 0.32)
  const rootsData = new Float32Array(COUNT * 8)
  const state = new Uint8Array(COUNT)
  const expires = new Float64Array(COUNT)
  const automatic = new Uint8Array(COUNT)
  const roots = storageBuffer(device, rootsData.byteLength, 'dandelion roots')
  const cellCount = FIELD[0] * FIELD[1] * FIELD[2]
  const field = storageBuffer(device, cellCount * 16, 'dandelion wind')
  const advected = storageBuffer(device, cellCount * 16, 'advected wind')
  const div = storageBuffer(device, cellCount * 4, 'wind divergence')
  const pressure = pingPong(device, cellCount * 4, 'wind pressure')
  const items = pingPong(device, COUNT * 64, 'dandelion seeds')

  const modules = await Promise.all([
    gpu.compile(advect(U.wgsl), 'dandelion wind advection'),
    gpu.compile(simulate(U.wgsl), 'dandelion motion'),
    gpu.compile(seeds(U.wgsl), 'dandelion filaments'),
    gpu.compile(landscape(U.wgsl), 'dandelion meadow'),
    gpu.compile(scene(U.wgsl), 'dandelion stem'),
    gpu.compile(divergence, 'dandelion divergence'),
    gpu.compile(jacobi, 'dandelion pressure'),
    gpu.compile(projectWind, 'dandelion projection'),
  ])
  const [
    advectionPipeline,
    divergencePipeline,
    pressurePipeline,
    projectionPipeline,
  ] = await Promise.all(
    [0, 5, 6, 7].map((i) =>
      device.createComputePipelineAsync({
        layout: 'auto',
        compute: { module: modules[i], entryPoint: 'main' },
      }),
    ),
  )
  const simPipeline = await device.createComputePipelineAsync({
    layout: 'auto',
    compute: { module: modules[1], entryPoint: 'main' },
  })
  const makeRender = (
    module: GPUShaderModule,
    entryPoint: string,
    targetFormat: GPUTextureFormat,
    blend?: GPUBlendState,
  ) =>
    device.createRenderPipelineAsync({
      layout: 'auto',
      vertex: { module, entryPoint },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{ format: targetFormat, blend }],
      },
    })
  const alpha: GPUBlendState = {
    color: {
      srcFactor: 'src-alpha',
      dstFactor: 'one-minus-src-alpha',
      operation: 'add',
    },
    alpha: {
      srcFactor: 'one',
      dstFactor: 'one-minus-src-alpha',
      operation: 'add',
    },
  }
  // 加算は透ける毛だけに使い、種と柄は背景を隠す普通の合成にする。
  const additive: GPUBlendState = {
    ...alpha,
    color: { ...alpha.color, dstFactor: 'one' },
  }
  const [bodyPipeline, hairPipeline, backgroundPipeline, scenePipeline] =
    await Promise.all([
      makeRender(modules[2], 'vsBody', format, alpha),
      makeRender(modules[2], 'vsHair', format, additive),
      makeRender(modules[3], 'vsFull', 'rgba8unorm'),
      makeRender(modules[4], 'vsFull', format),
    ])
  const advectionGroup = bindBuffers(
    device,
    advectionPipeline.getBindGroupLayout(0),
    [U.buffer, field, advected],
  )
  const divergenceGroup = bindBuffers(
    device,
    divergencePipeline.getBindGroupLayout(0),
    [advected, div],
  )
  const pressureGroups = pressure.buffers.map((buffer, i) =>
    bindBuffers(device, pressurePipeline.getBindGroupLayout(0), [
      div,
      buffer,
      pressure.buffers[1 - i],
    ]),
  )
  const projectionGroup = bindBuffers(
    device,
    projectionPipeline.getBindGroupLayout(0),
    [advected, pressure.buffers[0], field],
  )
  const simGroups = items.buffers.map((buffer, i) =>
    bindBuffers(device, simPipeline.getBindGroupLayout(0), [
      U.buffer,
      buffer,
      items.buffers[1 - i],
      roots,
      field,
    ]),
  )
  const hairGroups = items.buffers.map((buffer) =>
    bindBuffers(device, hairPipeline.getBindGroupLayout(0), [U.buffer, buffer]),
  )
  const bodyGroups = items.buffers.map((buffer) =>
    bindBuffers(device, bodyPipeline.getBindGroupLayout(0), [U.buffer, buffer]),
  )
  const backgroundGroup = bindBuffers(
    device,
    backgroundPipeline.getBindGroupLayout(0),
    [U.buffer],
  )
  const sampler = device.createSampler({
    minFilter: 'linear',
    magFilter: 'linear',
  })
  let backdrop: GPUTexture | undefined
  let sceneGroup: GPUBindGroup

  const initialize = (flying: number) => {
    state.fill(0)
    automatic.fill(0)
    expires.fill(0)
    const initial = new Float32Array(COUNT * 16)
    for (let i = 0; i < COUNT; i++) {
      const { direction, angle } = rootDirection(i, COUNT)
      rootsData.set([...direction, LIFETIME, 0, 0, 0, 0], i * 8)
      const position = direction.map(
        (v, j) => v * 0.265 + [headX(), headY, 0][j],
      )
      initial.set(
        [...position, 0, 0, 0, 0, 0, ...direction, angle, 0, 0, 0, 0],
        i * 16,
      )
      const example = [18, 30, 42, 54].indexOf(i)
      if (example >= 0 && example < flying) {
        // 初めの一枚でも、頭と離れた傘・柄・種のつながりが読めるように置く。
        const age = [2.3, 6.8, 4.1, 9.6][example]
        const depth = [-1.15, 0.18, 1.65, -0.55][example]
        const tilt = [-0.38, 0.29, -0.19, 0.42][example]
        initial.set(
          [
            headX() + [0.48, 1.08, 0.73, 1.52][example],
            headY + [0.29, 0.48, 0.82, 0.2][example],
            depth,
            age,
            0.1 + variation(i + 9) * 0.12,
            (variation(i + 19) - 0.5) * 0.08,
            (variation(i + 29) - 0.5) * 0.14,
            1,
            Math.sin(tilt),
            Math.cos(tilt),
            0,
            angle,
            0,
            0,
            0,
            0,
          ],
          i * 16,
        )
        rootsData[i * 8 + 7] = 1
        state[i] = 1
        automatic[i] = 1
        expires[i] = time + LIFETIME - age
      }
    }
    for (const buffer of items.buffers)
      device.queue.writeBuffer(buffer, 0, initial)
    device.queue.writeBuffer(roots, 0, rootsData)
  }

  const resize = () => {
    aspect = width / height
    const dpr = pixelRatio()
    canvas.width = Math.max(1, Math.round(width * dpr))
    canvas.height = Math.max(1, Math.round(height * dpr))
    backdrop?.destroy()
    // 背景には細部を作らず、低い解像度から補間して接写のぼけにする。
    backdrop = device.createTexture({
      size: [Math.max(1, Math.round(300 * aspect)), 300],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
    sceneGroup = device.createBindGroup({
      layout: scenePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: U.buffer } },
        { binding: 1, resource: backdrop.createView() },
        { binding: 2, resource: sampler },
      ],
    })
    landscapeDirty = true
    dirty = true
  }

  const isIdle = () => !pointerInside && performance.now() / 1000 >= idleAfter
  const updateUniform = (dt: number, fluidDt: number) => {
    U.set({
      res: [canvas.width, canvas.height],
      aspect,
      time,
      dt,
      fluidDt,
      breeze: reduced || !isIdle() ? 0 : P.breeze,
      focus: P.focus * pixelRatio(),
      light: P.light,
      head: [headX(), headY, 0, headAlpha],
      breath: [...breathPosition, breathStrength, 0],
      impulse: [...breathVelocity, 0],
    })
    U.upload()
  }
  const stepper = fixedStepper(1 / 120, 8)
  const render = (steps: number) => {
    if (failed) return
    updateUniform(steps > 0 ? stepper.step : 0, steps * stepper.step)
    const encoder = device.createCommandEncoder()
    if (steps > 0) {
      // 流体は描画ごとに経過した固定刻みの合計を進め、種はその流れの中で 1/120 秒ずつ積分する。
      for (const buffer of pressure.buffers) encoder.clearBuffer(buffer)
      const pass = encoder.beginComputePass()
      const dispatch = (pipeline: GPUComputePipeline, group: GPUBindGroup) => {
        pass.setPipeline(pipeline)
        pass.setBindGroup(0, group)
        pass.dispatchWorkgroups(Math.ceil(cellCount / 64))
      }
      dispatch(advectionPipeline, advectionGroup)
      dispatch(divergencePipeline, divergenceGroup)
      for (let i = 0; i < PRESSURE_ITERATIONS; i++)
        dispatch(pressurePipeline, pressureGroups[i % 2])
      // 偶数回なので、最後の圧力は buffers[0] にある。
      dispatch(projectionPipeline, projectionGroup)
      pass.end()
    }
    // dt=0 の一歩は、リサイズや静止画で頭の位置と放出の状態だけをそろえる。
    for (let i = 0; i < Math.max(1, steps); i++) {
      const pass = encoder.beginComputePass()
      pass.setPipeline(simPipeline)
      pass.setBindGroup(0, simGroups[items.index])
      pass.dispatchWorkgroups(Math.ceil(COUNT / 64))
      pass.end()
      items.flip()
    }
    if (landscapeDirty) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: backdrop!.createView(),
            loadOp: 'clear',
            clearValue: [0, 0, 0, 1],
            storeOp: 'store',
          },
        ],
      })
      pass.setPipeline(backgroundPipeline)
      pass.setBindGroup(0, backgroundGroup)
      pass.draw(3)
      pass.end()
      landscapeDirty = false
    }
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: 'clear',
          clearValue: [0, 0, 0, 1],
          storeOp: 'store',
        },
      ],
    })
    pass.setPipeline(scenePipeline)
    pass.setBindGroup(0, sceneGroup)
    pass.draw(3)
    pass.setPipeline(bodyPipeline)
    pass.setBindGroup(0, bodyGroups[items.index])
    pass.draw(6, COUNT * PARTS)
    pass.setPipeline(hairPipeline)
    pass.setBindGroup(0, hairGroups[items.index])
    pass.draw(6, COUNT * PARTS)
    pass.end()
    device.queue.submit([encoder.finish()])
    dirty = false
  }

  const release = (amount: number, stroke?: Stroke) => {
    if (renewal.active) return
    const candidates = stroke
      ? selectNearbySeeds(state, rootsData, [headX(), headY], stroke)
      : Array.from({ length: COUNT }, (_, i) => i).filter((i) => state[i] === 0)
    if (!stroke)
      candidates.sort((a, b) => {
        const score = (i: number) => {
          const at = i * 8
          const d = rootsData.subarray(at, at + 3)
          return (
            d[0] * 0.35 +
            d[1] * 0.25 +
            variation(i * 13 + releaseSerial * 97) * 1.2
          )
        }
        return score(b) - score(a)
      })
    for (const i of detachSeeds(state, candidates, amount, MAX_FLYING)) {
      expires[i] = time + LIFETIME
      automatic[i] = stroke ? 0 : 1
      // 放出は付着を外すだけ。初速も放出後の力も GPU 上の流体から受け取る。
      rootsData.set([0, 0, 0, 1], i * 8 + 4)
      device.queue.writeBuffer(
        roots,
        i * 32 + 16,
        rootsData.subarray(i * 8 + 4, i * 8 + 8),
      )
    }
    releaseSerial++
  }

  const lifecycle = () => {
    for (let i = 0; i < COUNT; i++)
      if (state[i] === 1 && time >= expires[i]) state[i] = 2
    const pose = renewal.advance(
      time,
      state.filter((value) => value === 0).length,
    )
    headY = pose.y
    headAlpha = pose.alpha
    if (pose.reset) {
      initialize(0)
      breathInput.reset()
      breathStrength = 0
      const encoder = device.createCommandEncoder()
      encoder.clearBuffer(field)
      device.queue.submit([encoder.finish()])
    }
    if (pose.completed) nextRelease = time + 2
  }

  const enter = () => {
    if (isIdle()) {
      // 見本の風を引き継がず、入ってきた息だけで流れを作る。
      const encoder = device.createCommandEncoder()
      encoder.clearBuffer(field)
      device.queue.submit([encoder.finish()])
    }
    pointerInside = true
    idleAfter = performance.now() / 1000 + IDLE_SECONDS
    // 寿命が切れた見本も戻す。自分の息で飛ばした種はそのまま追えるようにする。
    let reclaimed = false
    for (let i = 0; i < COUNT; i++) {
      if (!automatic[i] || state[i] === 0) continue
      state[i] = 0
      automatic[i] = 0
      expires[i] = 0
      rootsData[i * 8 + 7] = 0
      device.queue.writeBuffer(
        roots,
        i * 32 + 28,
        rootsData.subarray(i * 8 + 7, i * 8 + 8),
      )
      reclaimed = true
    }
    if (reclaimed) render(0)
  }
  const leave = () => {
    pointerInside = false
    idleAfter = performance.now() / 1000 + IDLE_SECONDS
    breathInput.reset()
    touchStart = undefined
    breathStrength = 0
    nextRelease = time + IDLE_SECONDS
  }
  touchGate(canvas)
  // touchGate の補助文は使わず、このデモの操作案内を左下の一行にまとめる。
  document.querySelector<HTMLElement>('.demo-hint-touch')?.remove()
  canvas.addEventListener('pointerenter', enter)
  canvas.addEventListener('pointerdown', (event) => {
    if (!acceptsPointer(event.pointerType, event.isPrimary)) return
    enter()
    breathInput.reset()
    if (event.pointerType === 'touch') {
      touchStart = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        accepted: canvas.style.touchAction === 'none',
      }
    }
  })
  canvas.addEventListener('pointermove', (event) => {
    if (failed || !acceptsPointer(event.pointerType, event.isPrimary)) return
    // 縦から始まる指の移動はページのスクロールに渡し、息を吹かない。
    if (event.pointerType === 'touch') {
      if (!touchStart || touchStart.id !== event.pointerId) return
      if (!touchStart.accepted) {
        const dx = Math.abs(event.clientX - touchStart.x)
        const dy = Math.abs(event.clientY - touchStart.y)
        if (Math.max(dx, dy) < 10) return
        if (dy > dx) {
          leave()
          return
        }
        touchStart.accepted = true
      }
    }
    if (!pointerInside) enter()
    const bounds = canvas.getBoundingClientRect()
    const x = (((event.clientX - bounds.left) / bounds.width) * 2 - 1) * aspect
    const y = 1 - ((event.clientY - bounds.top) / bounds.height) * 2
    const at = event.timeStamp / 1000
    const stroke = breathInput.move(
      x,
      y,
      at,
      bounds.height,
      [headX(), headY],
      P.breath,
    )
    if (!stroke) return
    breathPosition = [(stroke.from.x + x) / 2, (stroke.from.y + y) / 2]
    breathVelocity = stroke.velocity
    breathStrength = stroke.strength
    if (stroke.amount > 0) release(stroke.amount, stroke)
    if (reduced) {
      // 操作した距離の分だけ進め、入力が止まれば残りの慣性も自動では進めない。
      const steps = Math.max(1, Math.min(8, Math.ceil(stroke.distance * 80)))
      time += steps * stepper.step
      lifecycle()
      render(steps)
    }
  })
  canvas.addEventListener('pointerleave', leave)
  canvas.addEventListener('pointercancel', leave)
  canvas.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'touch') leave()
  })

  const gui = new GUI({ title: '設定' })
  gui.add(P, 'breeze', 0, 1.8, 0.05).name('野原の風')
  gui.add(P, 'breath', 0, 2, 0.05).name('息の強さ')
  gui
    .add(P, 'focus', 0, 4, 0.1)
    .name('奥のぼけ')
    .onChange(() => {
      dirty = true
    })
  gui
    .add(P, 'light', 0.5, 1.5, 0.05)
    .name('逆光')
    .onChange(() => {
      dirty = true
      landscapeDirty = true
    })
  gui.close()
  resize()
  initialize(4)
  if (canvas.matches(':hover') && matchMedia('(hover: hover)').matches) enter()
  render(0)
  onResize(stage, (size) => {
    width = Math.max(1, size.width)
    height = Math.max(1, size.height)
    resize()
    render(0)
  })
  onReducedMotion((value) => {
    reduced = value
    stepper.reset()
    breathInput.reset()
    breathStrength = 0
    render(0)
  })
  loop((dt) => {
    if (failed) return
    if (reduced) {
      if (dirty) render(0)
      return
    }
    const steps = stepper.advance(dt)
    time += steps * stepper.step
    breathStrength *= Math.exp(-dt * 6)
    lifecycle()
    if (isIdle() && time >= nextRelease && P.breeze > 0.05) {
      release(1)
      nextRelease =
        time + (0.45 + variation(releaseSerial * 43) * 1.2) / P.breeze
    }
    render(steps)
  })
}

try {
  await start(await createGpu(canvas, showError))
} catch (error) {
  if (error instanceof Unsupported) stage.classList.add('is-unsupported')
  else showError(error instanceof Error ? error.message : String(error))
}
