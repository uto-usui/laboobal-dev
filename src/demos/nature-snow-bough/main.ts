import GUI from 'lil-gui'
import { loop, onResize, pixelRatio } from '../../shared/dom'
import {
  bindBuffers,
  createGpu,
  type Gpu,
  storageBuffer,
  Unsupported,
} from '../../shared/gpu/device'
import { fixedStepper } from '../../shared/gpu/stepper'
import { onReducedMotion } from '../../shared/motion'
import { touchGate } from '../../shared/touch'
import { onRunningChange } from '../../shared/visibility'
import { pickBranchSite } from './picking'
import { viewForSize } from './projection'
import { startDrag, dragGrip, type Drag } from './dragging'
import {
  NEEDLE_STEPS,
  renderShader,
  TUBE_STEPS,
  TUBE_LENGTH_STEPS,
} from './render'
import { makeScene, STEP } from './scene'
import { makeSimulation, type Simulation } from './simulation'
import { drawStill } from './still'
import { SnowPowder } from './snow-powder'

const stage = document.querySelector<HTMLElement>('.nature-snow-bough')!
const canvas = stage.querySelector<HTMLCanvasElement>('.view')!
const stillCanvas = stage.querySelector<HTMLCanvasElement>('.still')!
const hint = stage.querySelector<HTMLElement>('.hint')!
let size = stage.getBoundingClientRect()
let scene = makeScene(size.width < 600)
let view = [0, 0.5, 7.2, 4.05]
let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
let stopLoop: (() => void) | undefined
let releaseTouch: (() => void) | undefined
let gpu: Gpu | undefined
let failed = false
let draw: (() => void) | undefined
let rebuild: (() => Promise<void>) | undefined
let gui: GUI | undefined

const updateView = () => {
  view = viewForSize(size.width, size.height)
}
const fallback = () => {
  stopLoop?.()
  stopLoop = undefined
  releaseTouch?.()
  releaseTouch = undefined
  failed = true
  gui?.destroy()
  gui = undefined
  stage.classList.remove('is-ready', 'is-dragging')
  stage.classList.add('is-unsupported')
  hint.textContent = 'このデモの操作には WebGPU 対応ブラウザが必要です'
  drawStill(stillCanvas, scene, view)
}
const showError = (message: string) => {
  console.error(message)
  fallback()
}
updateView()
drawStill(stillCanvas, scene, view)

const start = async (engine: Gpu) => {
  gpu = engine
  const { device, context, format } = engine
  let simulation = await makeSimulation(engine, scene)
  let segments = storageBuffer(
    device,
    scene.segments.byteLength,
    'bough segments',
    scene.segments,
  )
  let needles = storageBuffer(
    device,
    scene.needles.byteLength,
    'bough needles',
    scene.needles,
  )
  const module = await engine.compile(
    renderShader(simulation.uniform.wgsl),
    'snow bough surfaces',
  )
  const meshLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      ...[1, 2, 3, 4, 5].map((binding) => ({
        binding,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'read-only-storage' as const },
      })),
    ],
  })
  const shadowLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'depth' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'comparison' },
      },
    ],
  })
  const layout = device.createPipelineLayout({
    bindGroupLayouts: [meshLayout, shadowLayout],
  })
  const depthLayout = device.createPipelineLayout({
    bindGroupLayouts: [meshLayout],
  })
  const names = ['Branch', 'Snow', 'Needle']
  const pipelines = names.map((name) =>
    device.createRenderPipeline({
      label: `snow bough ${name}`,
      layout,
      vertex: { module, entryPoint: `vs${name}` },
      fragment: {
        module,
        entryPoint: name === 'Snow' ? 'fsSnow' : 'fs',
        targets: [{ format }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      multisample: { count: 4 },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    }),
  )
  const shadows = names.map((name) =>
    device.createRenderPipeline({
      label: `snow bough ${name} shadow`,
      layout: depthLayout,
      vertex: { module, entryPoint: `vs${name}Shadow` },
      ...(name === 'Snow'
        ? { fragment: { module, entryPoint: 'fsSnowShadow', targets: [] } }
        : {}),
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        format: 'depth32float',
        depthWriteEnabled: true,
        depthCompare: 'less',
        depthBias: 2,
        depthBiasSlopeScale: 1.5,
      },
    }),
  )
  const forest = device.createRenderPipeline({
    label: 'snow bough forest',
    layout: device.createPipelineLayout({ bindGroupLayouts: [meshLayout] }),
    vertex: { module, entryPoint: 'vsFull' },
    fragment: { module, entryPoint: 'forest', targets: [{ format }] },
    multisample: { count: 4 },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: false,
      depthCompare: 'always',
    },
  })
  const powder = device.createRenderPipeline({
    label: 'snow bough powder',
    layout: depthLayout,
    vertex: { module, entryPoint: 'vsPowder' },
    fragment: {
      module,
      entryPoint: 'fsPowder',
      targets: [
        {
          format,
          blend: {
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
          },
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
    multisample: { count: 4 },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: false,
      depthCompare: 'less',
    },
  })
  let powderState = new SnowPowder(scene.snows.length)
  let powderBuffer = storageBuffer(
    device,
    powderState.data.byteLength,
    'bough snow powder',
    powderState.data,
  )
  let mesh = bindBuffers(device, meshLayout, [
    simulation.uniform.buffer,
    simulation.points,
    segments,
    needles,
    simulation.snows,
    powderBuffer,
  ])
  const shadow = device.createTexture({
    label: 'bough shadow',
    size: [1024, 1024],
    format: 'depth32float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })
  const light = device.createBindGroup({
    layout: shadowLayout,
    entries: [
      { binding: 0, resource: shadow.createView() },
      {
        binding: 1,
        resource: device.createSampler({
          compare: 'less-equal',
          magFilter: 'linear',
          minFilter: 'linear',
        }),
      },
    ],
  })
  let color: GPUTexture | undefined
  let depth: GPUTexture | undefined
  const targets = () => {
    const ratio = Math.min(pixelRatio(), 1.5)
    const w = Math.max(1, Math.round(size.width * ratio)),
      h = Math.max(1, Math.round(size.height * ratio))
    if (!color || color.width !== w || color.height !== h) {
      color?.destroy()
      depth?.destroy()
      canvas.width = w
      canvas.height = h
      color = device.createTexture({
        size: [w, h],
        sampleCount: 4,
        format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      })
      depth = device.createTexture({
        size: [w, h],
        sampleCount: 4,
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      })
    }
    return { color: color.createView(), depth: depth!.createView() }
  }
  const paint = (encoder: GPUCommandEncoder, dt = 0) => {
    powderState.advance(simulation.snapshot.snow, dt)
    device.queue.writeBuffer(powderBuffer, 0, powderState.data)
    const counts = [
      [TUBE_STEPS * TUBE_LENGTH_STEPS * 6, scene.segments.length / 4],
      [6, scene.snows.length],
      [NEEDLE_STEPS * 6, scene.needles.length / 8],
    ]
    const shadowPass = encoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: {
        view: shadow.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    })
    shadowPass.setBindGroup(0, mesh)
    shadows.forEach((pipeline, i) => {
      shadowPass.setPipeline(pipeline)
      shadowPass.draw(counts[i][0], counts[i][1])
    })
    shadowPass.end()
    const target = targets()
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: target.color,
          resolveTarget: context.getCurrentTexture().createView(),
          loadOp: 'clear',
          clearValue: [0.7, 0.75, 0.7, 1],
          storeOp: 'discard',
        },
      ],
      depthStencilAttachment: {
        view: target.depth,
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
      },
    })
    pass.setPipeline(forest)
    pass.setBindGroup(0, mesh)
    pass.draw(3)
    pass.setBindGroup(1, light)
    pipelines.forEach((pipeline, i) => {
      pass.setPipeline(pipeline)
      pass.draw(counts[i][0], counts[i][1])
    })
    pass.setPipeline(powder)
    pass.draw(6, scene.snows.length * 3)
    pass.end()
  }
  const params = {
    adhesion: 1,
    brightness: 1,
    reset: () => void restart().catch((error) => showError(String(error))),
  }
  const stepper = fixedStepper(STEP, 4)
  let carry = 0
  let restarting = false
  let restartAgain = false
  let pointerId: number | undefined
  let drag: Drag | undefined
  let hover: number[] | undefined
  let snapshotClock = 0
  const release = () => {
    const captured = pointerId
    pointerId = undefined
    drag = undefined
    if (captured !== undefined && canvas.hasPointerCapture(captured))
      canvas.releasePointerCapture(captured)
    stage.classList.remove('is-dragging')
    if (reduced) draw?.()
    simulation.uniform.set({ gripOn: 0 })
  }
  const setParams = (sim: Simulation = simulation) =>
    sim.uniform.set({
      view,
      adhesion: params.adhesion,
      brightness: params.brightness,
    })
  draw = () => {
    if (restarting || failed) return
    setParams()
    simulation.uniform.set({ interpolation: 1 })
    simulation.uniform.upload()
    const encoder = device.createCommandEncoder()
    paint(encoder)
    device.queue.submit([encoder.finish()])
  }
  const warm = async () => {
    simulation.uniform.set({ settling: 1, gripOn: 0 })
    setParams()
    simulation.uniform.upload()
    for (let done = 0; done < 720 && !failed; done += 24) {
      const encoder = device.createCommandEncoder()
      simulation.encode(encoder, 24)
      device.queue.submit([encoder.finish()])
      await device.queue.onSubmittedWorkDone()
    }
    simulation.uniform.set({ settling: 0 })
    await simulation.readSnapshot()
    stepper.reset()
    carry = 0
  }
  const restart = async () => {
    if (restarting) {
      restartAgain = true
      return
    }
    restarting = true
    release()
    try {
      do {
        restartAgain = false
        const compact = size.width < 600
        if (compact !== scene.compact) {
          await simulation.readSnapshot()
          await device.queue.onSubmittedWorkDone()
          simulation.destroy()
          segments.destroy()
          needles.destroy()
          powderBuffer.destroy()
          scene = makeScene(compact)
          powderState = new SnowPowder(scene.snows.length)
          powderBuffer = storageBuffer(
            device,
            powderState.data.byteLength,
            'bough snow powder',
            powderState.data,
          )
          simulation = await makeSimulation(engine, scene)
          segments = storageBuffer(
            device,
            scene.segments.byteLength,
            'bough segments',
            scene.segments,
          )
          needles = storageBuffer(
            device,
            scene.needles.byteLength,
            'bough needles',
            scene.needles,
          )
          mesh = bindBuffers(device, meshLayout, [
            simulation.uniform.buffer,
            simulation.points,
            segments,
            needles,
            simulation.snows,
            powderBuffer,
          ])
        } else simulation.reset()
        powderState.reset()
        await warm()
      } while (restartAgain && !failed)
    } finally {
      restarting = false
    }
    draw?.()
  }
  rebuild = restart
  gui = new GUI({ title: '設定', width: 220 })
  gui
    .add(params, 'adhesion', 0.65, 1.6, 0.05)
    .name('雪の留まりやすさ')
    .onChange(() => setParams())
  gui
    .add(params, 'brightness', 0.85, 1.1, 0.01)
    .name('明るさ')
    .onChange(() => draw?.())
  gui.add(params, 'reset').name('雪を載せ直す')
  gui.close()
  gui.domElement.dataset.captureHide = ''
  const pick = (position: number[]) =>
    pickBranchSite(
      scene,
      simulation.snapshot.nodes,
      simulation.snapshot.snow,
      position,
      view,
      canvas.getBoundingClientRect(),
      simulation.snapshot.interpolation,
    )
  const updateHover = () =>
    stage.classList.toggle(
      'is-grabbable',
      !!hover && !restarting && !failed && pick(hover) !== undefined,
    )
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || restarting || failed || pointerId !== undefined)
      return
    const position = [event.clientX, event.clientY]
    const snapshot = simulation.snapshot
    drag = startDrag(
      scene,
      snapshot.nodes,
      snapshot.snow,
      position,
      view,
      canvas.getBoundingClientRect(),
      snapshot.interpolation,
    )
    if (!drag) return
    pointerId = event.pointerId
    canvas.setPointerCapture(event.pointerId)
    stage.classList.add('is-dragging')
    simulation.uniform.set({
      gripOn: 1,
      gripEdge: drag.edge,
      gripT: drag.t,
      grip: dragGrip(drag, position, view, canvas.getBoundingClientRect()),
    })
  })
  canvas.addEventListener('pointermove', (event) => {
    hover = [event.clientX, event.clientY]
    if (pointerId === undefined) {
      updateHover()
      return
    }
    if (event.pointerId !== pointerId || failed) return
    if (!drag) return
    simulation.uniform.set({
      grip: dragGrip(
        drag,
        [event.clientX, event.clientY],
        view,
        canvas.getBoundingClientRect(),
      ),
    })
  })
  canvas.addEventListener('pointerleave', () => {
    hover = undefined
    updateHover()
  })
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', release)
  canvas.addEventListener('lostpointercapture', release)
  onRunningChange((running) => {
    if (!running) {
      release()
      stepper.reset()
      carry = 0
    }
  })
  await restart()
  if (failed) return
  stage.classList.add('is-ready')
  releaseTouch = touchGate(canvas)
  // 操作案内は左下の一行へまとめ、touchGate の追加案内は重ねない。
  stage.closest('main.demo')?.querySelector('.demo-hint-touch')?.remove()
  onReducedMotion((value) => {
    const changed = reduced !== value
    reduced = value
    release()
    if (value && changed)
      void restart().catch((error) => showError(String(error)))
    stepper.reset()
    carry = 0
  })
  stopLoop = loop((dt) => {
    if (restarting || failed || (reduced && pointerId === undefined)) return
    const steps = stepper.advance(dt)
    carry = steps === 4 ? 0 : Math.max(0, carry + dt - steps * STEP)
    setParams()
    // 静止設定では指に追従する間だけ解き、自動の再積雪も停止する。
    const interpolation = Math.min(1, carry / STEP)
    simulation.uniform.set({
      interpolation,
      settling: 0,
      renew: reduced ? 0 : 1,
    })
    simulation.uniform.upload()
    const encoder = device.createCommandEncoder()
    simulation.encode(encoder, steps)
    paint(encoder, steps * STEP)
    device.queue.submit([encoder.finish()])
    snapshotClock += dt
    if (snapshotClock > 0.05) {
      snapshotClock = 0
      void simulation
        .readSnapshot(interpolation)
        .then(updateHover)
        .catch((error) => {
          if (!restarting && !failed) showError(String(error))
        })
    }
  })
  device.lost.then(() => {
    release()
    fallback()
  })
}

onResize(stage, () => {
  const compactBefore = scene.compact
  size = stage.getBoundingClientRect()
  updateView()
  if (!gpu || failed) {
    scene = makeScene(size.width < 600)
    drawStill(stillCanvas, scene, view)
  } else if (compactBefore !== size.width < 600) {
    void rebuild?.().catch((error) => showError(String(error)))
  } else draw?.()
})

try {
  await start(await createGpu(canvas, showError))
} catch (error) {
  if (error instanceof Unsupported) fallback()
  else showError(error instanceof Error ? error.message : String(error))
}
