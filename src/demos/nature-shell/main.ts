import GUI from 'lil-gui'
import { loop, onResize, pixelRatio } from '../../shared/dom'
import { createGpu, type Gpu, Unsupported } from '../../shared/gpu/device'
import { fixedStepper } from '../../shared/gpu/stepper'
import { createUniform } from '../../shared/gpu/uniform'
import { camera } from '../../shared/gpu/wgsl'
import { onReducedMotion } from '../../shared/motion'
import { touchGate } from '../../shared/touch'
import {
  createAutomaton,
  createMipChain,
  CELLS,
  historyRow,
  LIVE_ROWS,
  PATTERN_HEIGHT,
  PATTERN_WIDTH,
  PATTERNS,
  type PatternName,
  ROWS,
} from './automaton'
import {
  createMesh,
  frameShell,
  followShell,
  nearestRimCell,
  GROWTH_STEPS,
  intersectShell,
  projectPoint,
  shellPoint,
  type Vec3,
  SECTIONS,
  START_SIZE,
} from './geometry'
import {
  automaticRows,
  DURATION,
  INITIAL_ROWS,
  REMAINING_DURATION,
} from './growth'
import { SHELL_FIELDS, shadowShader, shellShader } from './shaders'

const stage = document.querySelector<HTMLElement>('.nature-shell')!
const canvas = stage.querySelector<HTMLCanvasElement>('.view')!
const input = stage.querySelector<HTMLButtonElement>('.shell-input')!
const flash = stage.querySelector<HTMLElement>('.rim-flash')!
const errorBox = stage.querySelector<HTMLElement>('.error')!
const unsupported = stage.querySelector<HTMLElement>('.unsupported')!

let failed = false
let stop: (() => void) | undefined
let gui: GUI | undefined
const fail = (message: string, details?: string) => {
  if (failed) return
  failed = true
  stop?.()
  gui?.destroy()
  input.disabled = true
  unsupported.textContent = message
  stage.classList.add('is-unsupported')
  if (details) {
    errorBox.textContent = details
    errorBox.hidden = false
    console.error(details)
  }
}

const P = { pattern: '三角' as PatternName }
const HOLD = 5

const start = async (gpu: Gpu) => {
  const { device, context, format } = gpu
  // 透明な背景から、CSSの暗い撮影台を見せる。共通のGPU設定は変えない。
  context.configure({ device, format, alphaMode: 'premultiplied' })
  const uniform = createUniform(device, 'Shell', SHELL_FIELDS)
  const [material, shadow] = await Promise.all([
    gpu.compile(shellShader(uniform.wgsl), 'shell material'),
    gpu.compile(shadowShader(uniform.wgsl), 'shell shadow'),
  ])
  const vertexLayout: GPUVertexBufferLayout = {
    arrayStride: 12,
    attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
  }
  const renderPipeline = await device.createRenderPipelineAsync({
    label: 'shell pigment and glaze',
    layout: 'auto',
    vertex: { module: material, entryPoint: 'vs', buffers: [vertexLayout] },
    fragment: { module: material, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
    multisample: { count: 4 },
  })
  const shadowPipeline = await device.createRenderPipelineAsync({
    label: 'shell soft shadow',
    layout: 'auto',
    vertex: { module: shadow, entryPoint: 'vsShadow', buffers: [vertexLayout] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: {
      format: 'depth32float',
      depthWriteEnabled: true,
      depthCompare: 'less',
      depthBias: 2,
      depthBiasSlopeScale: 2,
    },
  })
  const mesh = createMesh()
  const vertexBuffer = device.createBuffer({
    size: mesh.vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  })
  const indexBuffer = device.createBuffer({
    size: mesh.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(vertexBuffer, 0, mesh.vertices)
  device.queue.writeBuffer(indexBuffer, 0, mesh.indices)
  const texture = device.createTexture({
    label: 'shell permanent pigment history',
    size: [PATTERN_WIDTH, PATTERN_HEIGHT],
    mipLevelCount:
      Math.floor(Math.log2(Math.max(PATTERN_WIDTH, PATTERN_HEIGHT))) + 1,
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  })
  const shadowMap = device.createTexture({
    size: [1024, 1024],
    format: 'depth32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
  })
  const renderGroup = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniform.buffer } },
      { binding: 1, resource: texture.createView() },
      {
        binding: 2,
        resource: device.createSampler({
          addressModeU: 'clamp-to-edge',
          magFilter: 'linear',
          minFilter: 'linear',
          mipmapFilter: 'linear',
          maxAnisotropy: 4,
        }),
      },
      { binding: 3, resource: shadowMap.createView() },
      {
        binding: 4,
        resource: device.createSampler({
          compare: 'less-equal',
          magFilter: 'linear',
          minFilter: 'linear',
        }),
      },
    ],
  })
  const shadowGroup = device.createBindGroup({
    layout: shadowPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniform.buffer } }],
  })

  let generation = 0
  let automaton = createAutomaton(PATTERNS[P.pattern])
  let mips = createMipChain(automaton.history)
  let progress = (INITIAL_ROWS - 1) / (ROWS - 1)
  let manual = false
  let yaw = 0
  let pitch = 0
  let seconds = 0
  let flashAnimation: Animation | undefined
  let hover: { x: number; y: number } | undefined
  let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  let width = 1
  let height = 1
  let msaa: GPUTexture | undefined
  let depth: GPUTexture | undefined
  const stepper = fixedStepper(DURATION / ROWS, 4)

  const uploadRange = (from: number, to: number) => {
    for (const [mipLevel, level] of mips(from, to).entries()) {
      if (level.end <= level.start) continue
      device.queue.writeTexture(
        { texture, mipLevel, origin: [0, level.start] },
        level.data.subarray(
          level.start * level.width * 4,
          level.end * level.width * 4,
        ),
        { bytesPerRow: level.width * 4, rowsPerImage: level.end - level.start },
        [level.width, level.end - level.start],
      )
    }
  }
  const upload = (from = 0, clear = false) => {
    if (clear) return uploadRange(0, ROWS)
    while (from < automaton.row) {
      const first = historyRow(from)
      const count = Math.min(automaton.row - from, ROWS - first)
      uploadRange(first, first + count)
      from += count
    }
  }
  automaton.growTo(INITIAL_ROWS)
  upload()

  const light = camera([-4, 5, 2], [0, 0, 0], Math.PI / 3.2, 1, 0.1, 30)
  let frame = frameShell(1)
  let cam = camera(frame.eye, frame.target, Math.PI / 5, 1, 0.005, 40)
  let framedAspect = -1
  let centeredGrowth = -1
  let target = frame.target
  const updateCamera = () => {
    const growth = START_SIZE + (1 - START_SIZE) * progress
    const aspect = width / height
    if (aspect !== framedAspect) {
      framedAspect = aspect
      frame = frameShell(aspect)
      centeredGrowth = -1
    }
    const distance = frame.eye[2]
    // 回転で構図を補正せず、成長か画面比が変わったときだけ正面の中心を求める。
    if (growth !== centeredGrowth) {
      centeredGrowth = growth
      target = followShell(growth, aspect, distance)
    }
    const eye: Vec3 = [
      target[0] + distance * Math.sin(yaw) * Math.cos(pitch),
      target[1] + distance * Math.sin(pitch),
      distance * Math.cos(yaw) * Math.cos(pitch),
    ]
    cam = camera(eye, target, Math.PI / 5, aspect, 0.005, 40)
    uniform.set({ viewProj: cam.viewProj, lightProj: light.viewProj, eye })
  }
  const render = () => {
    if (failed || !msaa || !depth) return
    const growth = START_SIZE + (1 - START_SIZE) * progress
    updateCamera()
    uniform.set({
      growth,
      historyOffset: Math.max(0, automaton.row - ROWS) % LIVE_ROWS,
      historyFull: Number(automaton.row >= ROWS),
      wetness: reduced
        ? 0
        : manual
          ? 0.65
          : Math.max(0, 1 - Math.max(0, seconds - REMAINING_DURATION) / 2),
    })
    uniform.upload()
    const encoder = device.createCommandEncoder()
    const shadowPass = encoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: {
        view: shadowMap.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    })
    shadowPass.setPipeline(shadowPipeline)
    shadowPass.setBindGroup(0, shadowGroup)
    shadowPass.setVertexBuffer(0, vertexBuffer)
    shadowPass.setIndexBuffer(indexBuffer, 'uint32')
    const bodyCount = Math.ceil(progress * GROWTH_STEPS) * SECTIONS * 6
    if (bodyCount > 0) shadowPass.drawIndexed(bodyCount)
    shadowPass.drawIndexed(mesh.lipCount, 1, mesh.lipOffset)
    shadowPass.end()
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: msaa.createView(),
          resolveTarget: context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'discard',
        },
      ],
      depthStencilAttachment: {
        view: depth.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
      },
    })
    pass.setPipeline(renderPipeline)
    pass.setBindGroup(0, renderGroup)
    pass.setVertexBuffer(0, vertexBuffer)
    pass.setIndexBuffer(indexBuffer, 'uint32')
    if (bodyCount > 0) pass.drawIndexed(bodyCount)
    pass.drawIndexed(mesh.lipCount, 1, mesh.lipOffset)
    pass.end()
    device.queue.submit([encoder.finish()])
    updateCursor()
  }

  const offResize = onResize(stage, (size) => {
    const ratio = pixelRatio()
    width = Math.max(
      1,
      Math.min(
        device.limits.maxTextureDimension2D,
        Math.round(size.width * ratio),
      ),
    )
    height = Math.max(
      1,
      Math.min(
        device.limits.maxTextureDimension2D,
        Math.round(size.height * ratio),
      ),
    )
    canvas.width = width
    canvas.height = height
    msaa?.destroy()
    depth?.destroy()
    msaa = device.createTexture({
      size: [width, height],
      sampleCount: 4,
      format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    })
    depth = device.createTexture({
      size: [width, height],
      sampleCount: 4,
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    })
    render()
  })

  const reset = () => {
    flashAnimation?.cancel()
    automaton = createAutomaton(
      PATTERNS[P.pattern],
      0x71c3a9 + generation++ * 7919,
    )
    mips = createMipChain(automaton.history)
    manual = false
    seconds = 0
    // 初回・自動再開・新しい貝で、同じ成長位置と実際のCAの履歴から始める。
    automaton.growTo(INITIAL_ROWS)
    progress = (automaton.row - 1) / (ROWS - 1)
    upload(0, true)
  }
  const beginLoop = () => {
    stop?.()
    stop = undefined
    stepper.reset()
    if (reduced || failed) return
    stop = loop((dt) => {
      const steps = stepper.advance(dt)
      if (!steps || failed || (manual && !automaton.hasActivity)) return
      const from = automaton.row
      if (manual) automaton.growTo(automaton.row + steps)
      else {
        seconds += steps * stepper.step
        if (seconds >= REMAINING_DURATION + HOLD) reset()
        automaton.growTo(automaticRows(seconds))
      }
      progress = Math.min(1, (automaton.row - 1) / (ROWS - 1))
      if (automaton.row > from) upload(from)
      render()
    })
  }
  const restart = () => {
    reset()
    render()
    beginLoop()
  }
  const takeControl = () => {
    if (manual) return
    manual = true
    automaton.takeControl()
  }
  const excite = (cell: number) => {
    takeControl()
    automaton.excite(cell)
    const rect = canvas.getBoundingClientRect()
    const growth = START_SIZE + (1 - START_SIZE) * progress
    const point = projectPoint(
      shellPoint(growth, cell / (CELLS - 1), growth),
      cam.viewProj,
    )
    flash.style.left = `${((point[0] + 1) * rect.width) / 2}px`
    flash.style.top = `${((1 - point[1]) * rect.height) / 2}px`
    flashAnimation?.cancel()
    flashAnimation = flash.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: reduced ? 180 : 520,
      easing: 'ease-out',
    })
    const from = automaton.row
    // 一セル一行では縮小時に見えないので、同じCAで波の始まりまで進める。
    automaton.growTo(from + (reduced ? 96 : 8))
    progress = Math.min(1, (automaton.row - 1) / (ROWS - 1))
    upload(from)
    render()
    beginLoop()
  }

  const pickRim = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect()
    const growth = START_SIZE + (1 - START_SIZE) * progress
    return nearestRimCell(
      clientX - rect.left,
      clientY - rect.top,
      rect.width,
      rect.height,
      growth,
      cam.viewProj,
      CELLS,
    )
  }
  const updateCursor = () => {
    input.style.cursor =
      hover && pickRim(hover.x, hover.y) !== undefined ? 'pointer' : 'grab'
  }
  const pointerLeave = () => {
    hover = undefined
    updateCursor()
  }
  const isEmpty = (x: number, y: number) => {
    const rect = canvas.getBoundingClientRect()
    const direction = cam.ray(
      ((x - rect.left) / rect.width) * 2 - 1,
      1 - ((y - rect.top) / rect.height) * 2,
    )
    return !Number.isFinite(
      intersectShell(
        cam.eye,
        direction,
        START_SIZE + (1 - START_SIZE) * progress,
      ),
    )
  }
  let press:
    | {
        id: number
        x: number
        y: number
        yaw: number
        pitch: number
        moved: boolean
        orbit: boolean
        cell: number | undefined
      }
    | undefined
  const pointerDown = (event: PointerEvent) => {
    if (failed || !event.isPrimary || event.button !== 0) return
    const cell = pickRim(event.clientX, event.clientY)
    press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      yaw,
      pitch,
      moved: false,
      cell,
      orbit: cell === undefined && isEmpty(event.clientX, event.clientY),
    }
    takeControl()
    input.setPointerCapture(event.pointerId)
  }
  const pointerMove = (event: PointerEvent) => {
    hover = { x: event.clientX, y: event.clientY }
    updateCursor()
    if (!press || event.pointerId !== press.id) return
    const dx = event.clientX - press.x
    const dy = event.clientY - press.y
    if (Math.hypot(dx, dy) > 8) press.moved = true
    if (!press.orbit || !press.moved) return
    yaw = press.yaw - dx * 0.007
    pitch = Math.max(-1.1, Math.min(1.1, press.pitch + dy * 0.007))
    render()
  }
  const pointerUp = (event: PointerEvent) => {
    if (!press || event.pointerId !== press.id) return
    const selected = press
    press = undefined
    if (input.hasPointerCapture(event.pointerId))
      input.releasePointerCapture(event.pointerId)
    if (!selected.moved && selected.cell !== undefined) excite(selected.cell)
  }
  const cancel = () => {
    press = undefined
  }
  const activate = (event: MouseEvent) => {
    if (event.detail !== 0) return
    // キーボードでは、今見えている縁の中央に相当するセルへ入力する。
    const rect = canvas.getBoundingClientRect()
    const growth = START_SIZE + (1 - START_SIZE) * progress
    for (const v of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      const point = projectPoint(shellPoint(growth, v, growth), cam.viewProj)
      const cell = pickRim(
        rect.left + ((point[0] + 1) * rect.width) / 2,
        rect.top + ((1 - point[1]) * rect.height) / 2,
      )
      if (cell !== undefined) {
        excite(cell)
        break
      }
    }
  }
  const offTouch = touchGate(input)
  input.addEventListener('pointerdown', pointerDown)
  input.addEventListener('pointermove', pointerMove)
  input.addEventListener('pointerleave', pointerLeave)
  input.addEventListener('pointerup', pointerUp)
  input.addEventListener('pointercancel', cancel)
  input.addEventListener('lostpointercapture', cancel)
  input.addEventListener('click', activate)

  gui = new GUI({ title: '設定', width: 240 })
  gui
    .add(P, 'pattern', Object.keys(PATTERNS))
    .name('模様の決まり')
    // 決まりを替えたら新しい貝から育て直す。今の貝に入れると、触った扱いになって自然発火が止まり、新しい模様が出ない
    .onChange(restart)
  gui.add({ restart }, 'restart').name('新しい貝')
  gui.close()
  const offMotion = onReducedMotion((value) => {
    reduced = value
    if (!reduced && !manual)
      seconds = Math.max(
        seconds,
        ((automaton.row - INITIAL_ROWS) * DURATION) / ROWS,
      )
    if (generation === 0) reset()
    render()
    beginLoop()
  })

  window.addEventListener(
    'pagehide',
    () => {
      stop?.()
      flashAnimation?.cancel()
      offResize()
      offMotion()
      offTouch()
      gui?.destroy()
      input.removeEventListener('pointerdown', pointerDown)
      input.removeEventListener('pointermove', pointerMove)
      input.removeEventListener('pointerleave', pointerLeave)
      input.removeEventListener('pointerup', pointerUp)
      input.removeEventListener('pointercancel', cancel)
      input.removeEventListener('click', activate)
      input.removeEventListener('lostpointercapture', cancel)
      for (const resource of [
        vertexBuffer,
        indexBuffer,
        uniform.buffer,
        texture,
        shadowMap,
        msaa,
        depth,
      ])
        resource?.destroy()
      context.unconfigure()
      device.destroy()
    },
    { once: true },
  )
}

try {
  await start(
    await createGpu(canvas, (details) =>
      fail('WebGPU の描画を続けられません', details),
    ),
  )
} catch (error) {
  if (error instanceof Unsupported)
    fail('このブラウザは WebGPU に対応していません')
  else
    fail(
      'WebGPU の初期化に失敗しました',
      error instanceof Error ? error.message : String(error),
    )
}
