import GUI from 'lil-gui'
import { loop, onResize, pixelRatio } from '../../shared/dom'
import { onReducedMotion } from '../../shared/motion'
import {
  bindBuffers,
  createGpu,
  pingPong,
  Unsupported,
  type Gpu,
} from '../../shared/gpu/device'
import { createSchoolGrid } from './grid'
import { fixedStepper } from '../../shared/gpu/stepper'
import { createUniform } from '../../shared/gpu/uniform'
import { camera } from '../../shared/gpu/wgsl'
import { Hunter, hunterMesh, type Mode, type Vec } from './predator'
import { hunterDraw, hunterObserve } from './predator-shader'
import {
  draw,
  prepareDraw,
  SCHOOL_FIELDS,
  sim,
  water,
  waterComposite,
} from './shaders'

const stage = document.querySelector<HTMLElement>('.nature-school')!
const canvas = stage.querySelector<HTMLCanvasElement>('.view')!
const errorBox = stage.querySelector<HTMLElement>('.error')!

const showError = (message: string) => {
  errorBox.textContent = message
  errorBox.hidden = false
  console.error(message)
}

const MAX_FISH = 16384
const P = {
  count: 8192,
  predator: true,
  sep: 14,
  sepRadius: 0.8,
  ali: 2.2,
  coh: 0.9,
  current: 0.3,
  flee: 220,
  fearRadius: 5,
  relay: 0.93,
}

// 最大数の楕円にも余白を取り、逃げた魚が格子の端に集まるのを防ぐ
const CELL = 1.2
const GRID_ORIGIN: [number, number, number] = [-42, -30, -36]
const GRID_DIMS: [number, number, number] = [70, 50, 60]
const CENTER: [number, number, number] = [0, 0, 0]

let size = { w: 1, h: 1 }
let reduced = false
let redrawStill = () => {}

const scaleFor = (n: number) => Math.cbrt(n / 16384)

const start = async (gpu: Gpu) => {
  const { device, context, format } = gpu
  const U = createUniform(device, 'School', SCHOOL_FIELDS)
  const grid = await createSchoolGrid(gpu, {
    dims: GRID_DIMS,
    origin: GRID_ORIGIN,
    cellSize: CELL,
    capacity: MAX_FISH,
    stride: 3,
  })
  const [simM, waterM, drawM, hunterM, compositeM, observeM, prepareM] =
    await Promise.all([
      gpu.compile(sim(U.wgsl, grid.declare(0, 3)), 'school sim'),
      gpu.compile(water(U.wgsl), 'school water'),
      gpu.compile(draw(U.wgsl), 'school draw'),
      gpu.compile(hunterDraw(U.wgsl), 'school hunter'),
      gpu.compile(waterComposite, 'school water composite'),
      gpu.compile(hunterObserve(U.wgsl), 'hunter observation'),
      gpu.compile(prepareDraw(U.wgsl), 'school prepare draw'),
    ])
  const simP = device.createComputePipeline({
    label: 'school sim',
    layout: 'auto',
    compute: { module: simM, entryPoint: 'main' },
  })
  const prepareP = device.createComputePipeline({
    label: 'school prepare draw',
    layout: 'auto',
    compute: { module: prepareM, entryPoint: 'main' },
  })
  const prepared = device.createBuffer({
    label: 'school render data',
    size: MAX_FISH * 80,
    usage: GPUBufferUsage.STORAGE,
  })
  const observeP = device.createComputePipeline({
    label: 'hunter observation',
    layout: 'auto',
    compute: { module: observeM, entryPoint: 'main' },
  })
  const sampleBuffer = device.createBuffer({
    label: 'hunter samples',
    size: 256 * 48,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  })
  const SAMPLES = 4
  const waterP = device.createRenderPipeline({
    label: 'school water',
    layout: 'auto',
    vertex: { module: waterM, entryPoint: 'vsFull' },
    fragment: { module: waterM, entryPoint: 'fs', targets: [{ format }] },
  })
  const compositeP = device.createRenderPipeline({
    label: 'school water composite',
    layout: 'auto',
    vertex: { module: compositeM, entryPoint: 'vsFull' },
    fragment: { module: compositeM, entryPoint: 'fs', targets: [{ format }] },
    multisample: { count: SAMPLES },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: false,
      depthCompare: 'always',
    },
  })
  const drawP = device.createRenderPipeline({
    label: 'school draw',
    layout: 'auto',
    vertex: { module: drawM, entryPoint: 'vs' },
    primitive: { topology: 'triangle-strip' },
    fragment: {
      module: drawM,
      entryPoint: 'fs',
      targets: [{ format }],
    },
    multisample: { count: SAMPLES, alphaToCoverageEnabled: true },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  })
  const hunterP = device.createRenderPipeline({
    label: 'school hunter',
    layout: 'auto',
    vertex: {
      module: hunterM,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: 40,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32' },
            { shaderLocation: 3, offset: 28, format: 'float32x2' },
            { shaderLocation: 4, offset: 36, format: 'float32' },
          ],
        },
      ],
    },
    fragment: { module: hunterM, entryPoint: 'fs', targets: [{ format }] },
    multisample: { count: SAMPLES, alphaToCoverageEnabled: true },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  })
  const mesh = hunterMesh()
  const meshBuffer = device.createBuffer({
    label: 'hunter mesh: position, normal, material',
    size: mesh.vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(meshBuffer, 0, mesh.vertices)
  const meshIndices = device.createBuffer({
    label: 'hunter indices',
    size: mesh.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(meshIndices, 0, mesh.indices)
  const hunterG = bindBuffers(device, hunterP.getBindGroupLayout(0), [U.buffer])
  const waterG = bindBuffers(device, waterP.getBindGroupLayout(0), [U.buffer])

  let n = 0
  let fish: ReturnType<typeof pingPong> | undefined
  let simG: GPUBindGroup[] = []
  const drawG = bindBuffers(device, drawP.getBindGroupLayout(0), [
    U.buffer,
    prepared,
  ])
  let prepareG: GPUBindGroup[] = []
  let observeG: GPUBindGroup[] = []
  const alloc = (count: number) => {
    n = count
    fish?.destroy()
    const s = scaleFor(n)
    const init = new Float32Array(n * 12)
    for (let i = 0; i < n; i++) {
      // 体積に偏りが出ないよう、球の半径は乱数の立方根にする
      const r = Math.cbrt(Math.random())
      const y = Math.random() * 2 - 1
      const ring = Math.sqrt(1 - y * y)
      const a = Math.random() * Math.PI * 2
      init.set(
        [
          CENTER[0] + Math.cos(a) * ring * r * 20 * s,
          CENTER[1] + y * r * 13 * s,
          CENTER[2] + Math.sin(a) * ring * r * 16 * s,
          0,
          // 少し向きをばらし、ならしの間に近所の魚へそろえる
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 0.5,
          3 + Math.random(),
          0,
        ],
        i * 12,
      )
    }
    fish = pingPong(device, n * 48, 'fish', init)
    simG = [0, 1].map((k) =>
      bindBuffers(device, simP.getBindGroupLayout(0), [
        U.buffer,
        fish!.buffers[k],
        fish!.buffers[1 - k],
        ...grid.entries(),
      ]),
    )
    prepareG = [0, 1].map((k) =>
      bindBuffers(device, prepareP.getBindGroupLayout(0), [
        U.buffer,
        fish!.buffers[k],
        prepared,
      ]),
    )
    observeG = [0, 1].map((k) =>
      bindBuffers(device, observeP.getBindGroupLayout(0), [
        U.buffer,
        fish!.buffers[k],
        sampleBuffer,
      ]),
    )
    U.set({
      n,
      radii: [20 * s, 13 * s, 16 * s],
      center: CENTER,
    })
  }

  let msaa: GPUTexture | undefined
  let depth: GPUTexture | undefined
  let msaaView: GPUTextureView
  let depthView: GPUTextureView
  let waterImage: GPUTexture | undefined
  let waterView: GPUTextureView
  let compositeG: GPUBindGroup
  let waterTime = Number.NaN
  const linearSampler = device.createSampler({
    minFilter: 'linear',
    magFilter: 'linear',
  })
  const target = () => {
    if (!msaa || msaa.width !== size.w || msaa.height !== size.h) {
      msaa?.destroy()
      depth?.destroy()
      waterImage?.destroy()
      waterImage = device.createTexture({
        label: 'school smooth water',
        size: [
          Math.max(1, Math.ceil(size.w / 4)),
          Math.max(1, Math.ceil(size.h / 4)),
        ],
        format,
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      })
      waterView = waterImage.createView()
      compositeG = device.createBindGroup({
        layout: compositeP.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: waterView },
          { binding: 1, resource: linearSampler },
        ],
      })
      waterTime = Number.NaN
      depth = device.createTexture({
        size: [size.w, size.h],
        sampleCount: SAMPLES,
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      })
      canvas.width = size.w
      canvas.height = size.h
      msaa = device.createTexture({
        size: [size.w, size.h],
        sampleCount: SAMPLES,
        format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      })
      msaaView = msaa.createView()
      depthView = depth.createView()
    }
    if (!depth) throw new Error('深度バッファがありません')
    return msaa
  }

  // ---------- カメラと捕食魚 ----------
  const pointer = { x: 0, y: 0, inside: false }
  let pendingPointer = false
  let clientX = 0
  let clientY = 0
  const queuePointer = (event: PointerEvent) => {
    clientX = event.clientX
    clientY = event.clientY
    pendingPointer = true
    pointer.inside = true
  }
  stage.addEventListener('pointermove', queuePointer)
  stage.addEventListener('pointerleave', () => {
    pointer.inside = false
  })
  const flushPointer = () => {
    if (!pendingPointer) return
    pendingPointer = false
    const rect = canvas.getBoundingClientRect()
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = ((clientY - rect.top) / rect.height) * 2 - 1
    noteInput()
  }
  let time = 0
  let ambientTime = 0
  let quietUntil = 0
  let shockLeft = 0
  const shockPos: Vec = [0, 0, 0]
  const interacting = () => pointer.inside || performance.now() < quietUntil
  const noteInput = () => {
    quietUntil = performance.now() + 5000
  }
  // 高頻度のイベントは最後の座標だけ保持し、投影と DOM の読み取りはフレームに一度。
  canvas.addEventListener('pointerdown', queuePointer)
  let cam = camera([0, 0, -50], CENTER, 1, 1, 1, 600)
  const predator = new Hunter()
  let mode: Mode = 'auto'
  const modeButtons = stage.querySelectorAll<HTMLButtonElement>('[data-mode]')
  const modeNote = stage.querySelector<HTMLElement>('.mode-note')!
  const syncMode = () => {
    for (const button of modeButtons)
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode))
    modeNote.textContent = reduced
      ? '動きを減らす設定: 静止画'
      : mode === 'auto'
        ? 'クリック・タップで散らす'
        : 'カーソル・指を追う · クリック・タップで散らす'
  }
  for (const button of modeButtons) {
    button.addEventListener('click', () => {
      mode = button.dataset.mode as Mode
      syncMode()
    })
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
        return
      event.preventDefault()
      mode =
        event.key === 'Home'
          ? 'auto'
          : event.key === 'End'
            ? 'manual'
            : mode === 'auto'
              ? 'manual'
              : 'auto'
      syncMode()
      stage.querySelector<HTMLButtonElement>(`[data-mode="${mode}"]`)!.focus()
    })
  }

  let cameraTime = Number.NaN
  let cameraWidth = 0
  let cameraHeight = 0
  const updateCamera = () => {
    if (
      cameraTime === ambientTime &&
      cameraWidth === size.w &&
      cameraHeight === size.h
    )
      return
    cameraTime = ambientTime
    cameraWidth = size.w
    cameraHeight = size.h
    const s = scaleFor(n)
    const aspect = size.w / size.h
    // 横幅の約 6 割を群れに使い、縦長では横幅が足りるまで引く
    const dist =
      (20 / (0.6 * Math.tan((52 * Math.PI) / 360) * 1.6)) *
      s *
      Math.max(1, 1.6 / aspect)
    const eye: [number, number, number] = [
      Math.sin(ambientTime * 0.031) * 1.5 * s,
      Math.sin(ambientTime * 0.047) * 0.4 * s,
      -dist,
    ]
    cam = camera(
      eye,
      [eye[0], eye[1], 0],
      (52 * Math.PI) / 180,
      aspect,
      0.1,
      400,
    )
    U.set({
      viewProj: cam.viewProj,
      eye,
      res: [size.w, size.h],
      aspect,
    })
  }

  const updatePredator = (dt: number) => {
    // 画面の点は群れの中央の深さへ投影し、魚自身はそこへ操舵で向かう。
    let cursor: Vec | undefined
    if (P.predator && mode === 'manual') {
      const ray = cam.ray(pointer.x, -pointer.y)
      const distance = (CENTER[2] - cam.eye[2]) / ray[2]
      cursor = [
        cam.eye[0] + ray[0] * distance,
        cam.eye[1] + ray[1] * distance,
        cam.eye[2] + ray[2] * distance,
      ]
    }
    for (let step = 0; step < Math.round(dt / stepper.step); step++) {
      if (P.predator) predator.step(stepper.step, mode, cursor, scaleFor(n))
    }
    const end = (offset: number) =>
      predator.pos.map((v, i) => v + predator.dir[i] * offset) as Vec
    U.set({
      predatorOn: P.predator ? 1 : 0,
      predatorA: end(-2.5),
      predatorB: end(2.8),
      predatorPos: predator.pos,
      predatorDir: predator.dir,
      predatorBend: predator.bend,
      predatorPhase: predator.phase,
    })
  }

  // 非同期で 0.6 秒に一度だけ群れを観察する。描画のループでは読み戻しを待たない。
  const observation = device.createBuffer({
    label: 'hunter observation',
    size: 256 * 48,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })
  let observing = false
  let observeAt = 0
  const observe = (encoder: GPUCommandEncoder) => {
    if (
      !P.predator ||
      observing ||
      reduced ||
      mode !== 'auto' ||
      time < observeAt
    )
      return false
    observing = true
    observeAt = time + 0.6
    const pass = encoder.beginComputePass({ label: 'hunter observation' })
    pass.setPipeline(observeP)
    pass.setBindGroup(0, observeG[fish!.index])
    pass.dispatchWorkgroups(1)
    pass.end()
    encoder.copyBufferToBuffer(sampleBuffer, 0, observation, 0, 256 * 48)
    return true
  }
  const readObservation = () => {
    const source = fish
    void observation
      .mapAsync(GPUMapMode.READ, 0, 256 * 48)
      .then(() => {
        if (source === fish)
          predator.observe(
            new Float32Array(observation.getMappedRange(0, 256 * 48)),
            256,
          )
        observation.unmap()
      })
      .catch((error) => showError(String(error)))
      .finally(() => {
        observing = false
      })
  }

  canvas.addEventListener('click', (event) => {
    if (event.button !== 0 || restarting || reduced) return
    noteInput()
    const rect = canvas.getBoundingClientRect()
    const ray = cam.ray(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((event.clientY - rect.top) / rect.height) * 2,
    )
    // 群れの中央の奥行きで叩き、球状に押し広げる。捕食魚は泳ぎ続ける。
    const distance = (CENTER[2] - cam.eye[2]) / ray[2]
    for (let k = 0; k < 3; k++) shockPos[k] = cam.eye[k] + ray[k] * distance
    shockLeft = 0.35
  })

  const setParams = () =>
    U.set({
      sep: P.sep,
      sepRadius: P.sepRadius,
      ali: P.ali,
      coh: P.coh,
      current: P.current,
      flee: P.flee,
      fearRadius: P.fearRadius,
      relay: P.relay,
      perception: CELL,
      boundary: 40,
      maxAcc: 30,
      vMin: 2.5,
      vMax: 6,
      calm: 0.8,
      fishSize: 1.0,
      minPx: 1.2,
      haze: 0.008,
    })

  const stepper = fixedStepper(1 / 60, 3)
  const encodeSteps = (encoder: GPUCommandEncoder, steps: number) => {
    for (let s = 0; s < steps; s++) {
      grid.encode(encoder, fish!.read, n)
      const pass = encoder.beginComputePass({ label: 'school sim' })
      pass.setPipeline(simP)
      pass.setBindGroup(0, simG[fish!.index])
      pass.dispatchWorkgroups(Math.ceil(n / 256))
      pass.end()
      fish!.flip()
    }
  }

  const render = (encoder: GPUCommandEncoder) => {
    target()
    // 操作中は背景の時計が止まるため、同じ水を描き直す必要はない。
    if (waterTime !== ambientTime) {
      const waterPass = encoder.beginRenderPass({
        label: 'school water',
        colorAttachments: [
          { view: waterView, loadOp: 'clear', storeOp: 'store' },
        ],
      })
      waterPass.setPipeline(waterP)
      waterPass.setBindGroup(0, waterG)
      waterPass.draw(3)
      waterPass.end()
      waterTime = ambientTime
    }
    const preparation = encoder.beginComputePass({
      label: 'school prepare draw',
    })
    preparation.setPipeline(prepareP)
    preparation.setBindGroup(0, prepareG[fish!.index])
    preparation.dispatchWorkgroups(Math.ceil(n / 256))
    preparation.end()
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: msaaView,
          resolveTarget: context.getCurrentTexture().createView(),
          loadOp: 'clear',
          clearValue: [0, 0, 0, 1],
          storeOp: 'discard',
        },
      ],
      depthStencilAttachment: {
        view: depthView,
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
      },
    })
    pass.setPipeline(compositeP)
    pass.setBindGroup(0, compositeG)
    pass.draw(3)
    pass.setPipeline(drawP)
    pass.setBindGroup(0, drawG)
    pass.draw(4, n)
    if (P.predator) {
      pass.setPipeline(hunterP)
      pass.setBindGroup(0, hunterG)
      pass.setVertexBuffer(0, meshBuffer)
      pass.setIndexBuffer(meshIndices, 'uint16')
      pass.drawIndexed(mesh.indices.length)
    }
    pass.end()
  }

  /** 見えないところで歩を進める。開いた直後と、動きを減らす設定の止まった絵に使う */
  const warm = async (steps: number) => {
    U.set({ dt: stepper.step, predatorOn: 0, shockPower: 0 })
    for (let done = 0; done < steps; done += 30) {
      time += stepper.step * 30
      ambientTime = time
      U.set({ time, ambientTime })
      U.upload()
      const encoder = device.createCommandEncoder()
      encodeSteps(encoder, 30)
      device.queue.submit([encoder.finish()])
      await device.queue.onSubmittedWorkDone()
    }
  }

  const still = () => {
    updateCamera()
    updatePredator(0)
    U.upload()
    const encoder = device.createCommandEncoder()
    render(encoder)
    device.queue.submit([encoder.finish()])
  }

  let restarting = false
  let restartAgain = false
  const frame = (dt: number) => {
    if (restarting || reduced) return
    flushPointer()
    const steps = stepper.advance(dt)
    time += steps * stepper.step
    if (!reduced && !interacting()) ambientTime += steps * stepper.step
    updateCamera()
    updatePredator(steps * stepper.step)
    U.set({
      dt: stepper.step,
      time,
      ambientTime,
      shockPos,
      shockPower: shockLeft / 0.35,
      shockRadius: 11 * scaleFor(n),
    })
    shockLeft = Math.max(0, shockLeft - steps * stepper.step)
    U.upload()
    const encoder = device.createCommandEncoder()
    encodeSteps(encoder, steps)
    render(encoder)
    const sampling = observe(encoder)
    device.queue.submit([encoder.finish()])
    if (sampling) readObservation()
  }

  const restart = async () => {
    if (restarting) {
      restartAgain = true
      return
    }
    restarting = true
    try {
      do {
        restartAgain = false
        shockLeft = 0
        alloc(P.count)
        setParams()
        updateCamera()
        await warm(reduced ? 600 : 240)
      } while (restartAgain)
      stepper.reset()
      observeAt = 0
      still()
    } finally {
      restarting = false
    }
  }

  // ---------- 設定 ----------
  const gui = new GUI({ title: '設定' })
  gui
    .add(P, 'predator')
    .name('捕食魚')
    .onChange(() => {
      if (reduced) still()
    })
  const tune = gui.addFolder('群れ').close()
  tune.add(P, 'sep', 0, 40, 0.5).name('離れる強さ').onChange(setParams)
  tune
    .add(P, 'sepRadius', 0.2, 1.2, 0.01)
    .name('離れる距離')
    .onChange(setParams)
  tune.add(P, 'ali', 0, 6, 0.05).name('そろえる強さ').onChange(setParams)
  tune.add(P, 'coh', 0, 4, 0.05).name('寄る強さ').onChange(setParams)
  tune.add(P, 'current', 0, 5, 0.05).name('潮の流れ').onChange(setParams)
  tune.add(P, 'flee', 0, 600, 5).name('逃げる強さ').onChange(setParams)
  tune.add(P, 'fearRadius', 1, 20, 0.5).name('怖がる距離').onChange(setParams)
  tune
    .add(P, 'relay', 0.5, 0.99, 0.005)
    .name('おびえの伝わり')
    .onChange(setParams)
  const population = gui.addFolder('描画').close()
  population
    .add(P, 'count', { '4,096 匹': 4096, '8,192 匹': 8192, '16,384 匹': 16384 })
    .name('魚の数')
    .onChange(() => void restart().catch((error) => showError(String(error))))
  gui.close()

  await restart()
  // 動きを減らす設定に切り替えたら、その場で止まった絵にする（決まりは docs/demo-guide.md の 5 章）
  onReducedMotion((value) => {
    reduced = value
    stepper.reset()
    shockLeft = 0
    syncMode()
    if (value) still()
  })
  redrawStill = () => {
    if (reduced && !restarting) still()
  }
  loop(frame)
}

onResize(stage, ({ width, height }) => {
  const dpr = pixelRatio()
  size = {
    w: Math.max(1, Math.floor(width * dpr)),
    h: Math.max(1, Math.floor(height * dpr)),
  }
  redrawStill()
})

try {
  reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  await start(await createGpu(canvas, showError))
} catch (error) {
  if (error instanceof Unsupported) stage.classList.add('is-unsupported')
  else showError(error instanceof Error ? error.message : String(error))
}
