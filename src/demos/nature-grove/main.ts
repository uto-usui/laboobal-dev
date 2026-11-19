import GUI from 'lil-gui'
import { loop, onResize, pixelRatio } from '../../shared/dom'
import { createGpu, Unsupported, type Gpu } from '../../shared/gpu/device'
import { createUniform } from '../../shared/gpu/uniform'
import { onReducedMotion } from '../../shared/motion'
import { isRunning, onRunningChange } from '../../shared/visibility'
import {
  FOV,
  groundPoint,
  INITIAL_ROOTS,
  sceneCamera,
  treeScale,
} from './scene'
import { OBJECT_FIELDS, sky, surface, TREE_FIELDS } from './shaders'
import { meshGround } from './terrain'
import {
  cross,
  createTree,
  GROW_SECONDS,
  lightDirection,
  MAX_TREES,
  smooth,
  STRIDE,
  unit,
  type V3,
} from './tree'

const stage = document.querySelector<HTMLElement>('.nature-grove')!
const canvas = stage.querySelector<HTMLCanvasElement>('.view')!
const planting = stage.querySelector<HTMLButtonElement>('.planting')!
const errorBox = stage.querySelector<HTMLElement>('.error')!
const status = stage.querySelector<HTMLElement>('.plant-status')!
let failed = false
let disposed = false
let disposeScene: (() => void) | undefined
const fail = (message?: string) => {
  if (disposed) return
  failed = true
  planting.disabled = true
  disposeScene?.()
  stage.classList.add(message ? 'is-error' : 'is-unsupported')
  stage.setAttribute('aria-busy', 'false')
  if (message) {
    errorBox.textContent = message
    errorBox.hidden = false
    console.error(message)
  }
}
const showError = (message: string) =>
  fail(message.startsWith('GPU デバイスを失いました') ? undefined : message)

const start = async ({ device, context, format, compile }: Gpu) => {
  const U = createUniform(device, 'TreeScene', TREE_FIELDS)
  const objectSchema = createUniform(device, 'TreeObject', OBJECT_FIELDS)
  let stopAnimation: (() => void) | undefined
  let gui: GUI | undefined
  let color: GPUTexture | undefined
  let depth: GPUTexture | undefined
  let size = stage.getBoundingClientRect()
  let cam = sceneCamera(size.width / Math.max(1, size.height))
  let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  let dirty = true
  let shadowDirty = true
  const settings = { generations: 6, angle: 28, forks: 2 }
  const samples = 4
  const depthFormat = 'depth24plus'
  const shadowDepth = device.createTexture({
    label: 'forest shadow',
    size: [1024, 1024],
    format: 'depth32float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })
  const shadowView = shadowDepth.createView()
  const sampler = device.createSampler({
    compare: 'less-equal',
    minFilter: 'linear',
    magFilter: 'linear',
  })
  const meshes: { destroy: () => void }[] = []
  // 初期化途中でも、コンパイルやパイプラインで失敗した資源を解放する。
  const cleanups: (() => void)[] = []
  disposeScene = () => {
    if (disposed) return
    disposed = true
    stopAnimation?.()
    gui?.destroy()
    for (const cleanup of cleanups) cleanup()
    for (const mesh of [...meshes]) mesh.destroy()
    U.buffer.destroy()
    objectSchema.buffer.destroy()
    shadowDepth.destroy()
    color?.destroy()
    depth?.destroy()
    context.unconfigure()
    device.destroy()
  }
  const pagehide = () => disposeScene?.()
  window.addEventListener('pagehide', pagehide, { once: true })
  cleanups.push(() => window.removeEventListener('pagehide', pagehide))
  const [skyModule, surfaceModule] = await Promise.all([
    compile(sky(U.wgsl), 'forest sky'),
    compile(surface(U.wgsl, objectSchema.wgsl), 'forest branches and leaves'),
  ])
  if (failed || disposed) return
  const uniformEntry = {
    binding: 0,
    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
    buffer: { type: 'uniform' as const },
  }
  const sceneLayout = device.createBindGroupLayout({
    entries: [
      uniformEntry,
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'depth' },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'comparison' },
      },
    ],
  })
  const shadowLayout = device.createBindGroupLayout({ entries: [uniformEntry] })
  const objectLayout = device.createBindGroupLayout({ entries: [uniformEntry] })
  const surfaceLayout = device.createPipelineLayout({
    bindGroupLayouts: [sceneLayout, objectLayout],
  })
  const vertexBuffers: GPUVertexBufferLayout[] = [
    {
      arrayStride: STRIDE * 4,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x4' },
        { shaderLocation: 3, offset: 40, format: 'float32x3' },
        { shaderLocation: 4, offset: 52, format: 'float32x3' },
      ],
    },
  ]
  const skyPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: skyModule, entryPoint: 'vsFull' },
    fragment: { module: skyModule, entryPoint: 'fsSky', targets: [{ format }] },
    multisample: { count: samples },
    depthStencil: {
      format: depthFormat,
      depthWriteEnabled: false,
      depthCompare: 'always',
    },
  })
  const shadowPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [shadowLayout, objectLayout],
    }),
    vertex: {
      module: surfaceModule,
      entryPoint: 'vsShadow',
      buffers: vertexBuffers,
    },
    primitive: { topology: 'triangle-list' },
    depthStencil: {
      format: 'depth32float',
      depthWriteEnabled: true,
      depthCompare: 'less',
      depthBias: 1,
      depthBiasSlopeScale: 1.5,
    },
  })
  const makeSurfacePipeline = (fading: boolean) =>
    device.createRenderPipeline({
      layout: surfaceLayout,
      vertex: {
        module: surfaceModule,
        entryPoint: 'vsSurface',
        buffers: vertexBuffers,
      },
      fragment: {
        module: surfaceModule,
        entryPoint: 'fsSurface',
        targets: [
          {
            format,
            blend: fading
              ? {
                  color: {
                    srcFactor: 'src-alpha',
                    dstFactor: 'one-minus-src-alpha',
                  },
                  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
                }
              : undefined,
          },
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      multisample: { count: samples },
      depthStencil: {
        format: depthFormat,
        depthWriteEnabled: !fading,
        depthCompare: 'less',
      },
    })
  const surfacePipeline = makeSurfacePipeline(false)
  const fadePipeline = makeSurfacePipeline(true)
  const uniformBinding = { binding: 0, resource: { buffer: U.buffer } }
  const skyGroup = device.createBindGroup({
    layout: skyPipeline.getBindGroupLayout(0),
    entries: [uniformBinding],
  })
  const shadowGroup = device.createBindGroup({
    layout: shadowLayout,
    entries: [uniformBinding],
  })
  const surfaceGroup = device.createBindGroup({
    layout: sceneLayout,
    entries: [
      uniformBinding,
      { binding: 1, resource: shadowView },
      { binding: 2, resource: sampler },
    ],
  })
  const mesh = (data: {
    vertices: Float32Array<ArrayBuffer>
    indices: Uint32Array<ArrayBuffer>
    traits?: { leafScale: number }
  }) => {
    const upload = (
      array: Float32Array<ArrayBuffer> | Uint32Array<ArrayBuffer>,
      usage: number,
    ) => {
      const buffer = device.createBuffer({
        size: array.byteLength,
        usage: usage | GPUBufferUsage.COPY_DST,
      })
      device.queue.writeBuffer(buffer, 0, array)
      return buffer
    }
    const vertex = upload(data.vertices, GPUBufferUsage.VERTEX)
    const index = upload(data.indices, GPUBufferUsage.INDEX)
    const state = createUniform(device, 'TreeObject', OBJECT_FIELDS)
    state.set({
      age: GROW_SECONDS,
      opacity: 1,
      leafScale: data.traits?.leafScale ?? 1,
      modelScale: 1,
    })
    state.upload()
    const group = device.createBindGroup({
      layout: objectLayout,
      entries: [{ binding: 0, resource: { buffer: state.buffer } }],
    })
    const result = {
      vertex,
      index,
      state,
      group,
      count: data.indices.length,
      destroy: () => {
        vertex.destroy()
        index.destroy()
        state.buffer.destroy()
        const at = meshes.indexOf(result)
        if (at >= 0) meshes.splice(at, 1)
      },
    }
    meshes.push(result)
    return result
  }
  const ground = mesh(meshGround())
  type Planted = {
    root: V3
    seed: number
    age: number
    automatic: boolean
    model: ReturnType<typeof createTree>
    mesh: ReturnType<typeof mesh>
    retirement?: number
  }
  const trees: Planted[] = []
  let retiring: Planted | undefined
  const fitTree = (tree: Planted) => {
    const scale = treeScale(cam, tree.root, tree.model.vertices)
    tree.mesh.state.set({
      root: tree.root,
      modelScale: scale,
      leafScale: tree.model.traits.leafScale * scale,
    })
  }
  const writeState = (tree: Planted) => {
    tree.mesh.state.set({
      age: tree.age,
      opacity:
        tree.retirement === undefined ? 1 : 1 - smooth(tree.retirement / 0.7),
    })
    tree.mesh.state.upload()
  }
  const plant = (root: V3, automatic = false) => {
    if (failed || disposed) return
    if (trees.length === MAX_TREES) {
      retiring?.mesh.destroy()
      retiring = trees.shift()
      if (retiring) retiring.retirement = 0
    }
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]
    const light = lightDirection(
      root,
      trees.map((tree) => tree.root),
    )
    const model = createTree({ ...settings }, seed, root, light)
    const tree: Planted = {
      root,
      seed,
      age: automatic && reduced ? GROW_SECONDS : 0,
      automatic,
      model,
      mesh: mesh(model),
    }
    fitTree(tree)
    writeState(tree)
    trees.push(tree)
    shadowDirty = true
    stage.dataset.treeCount = String(trees.length)
    stage.dataset.seed = String(seed)
    stage.dataset.branches = String(model.branches.length)
    if (!automatic)
      status.textContent = `木を植えました。今は${trees.length}本です。`
  }
  for (const root of INITIAL_ROOTS) plant(root, true)
  const drawMesh = (
    pass: GPURenderPassEncoder,
    object: ReturnType<typeof mesh>,
  ) => {
    pass.setBindGroup(1, object.group)
    pass.setVertexBuffer(0, object.vertex)
    pass.setIndexBuffer(object.index, 'uint32')
    pass.drawIndexed(object.count)
  }
  const render = () => {
    dirty = true
    if (failed || disposed || !isRunning()) return
    dirty = false
    const dpr = Math.min(
      pixelRatio(),
      Math.sqrt(2_400_000 / (size.width * size.height)),
    )
    const width = Math.max(1, Math.floor(size.width * dpr))
    const height = Math.max(1, Math.floor(size.height * dpr))
    if (!color || color.width !== width || color.height !== height) {
      color?.destroy()
      depth?.destroy()
      canvas.width = width
      canvas.height = height
      color = device.createTexture({
        size: [width, height],
        sampleCount: samples,
        format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      })
      depth = device.createTexture({
        size: [width, height],
        sampleCount: samples,
        format: depthFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      })
    }
    const sun = unit([-0.5, 0.85, 0.35])
    const lightRight = unit(cross([0, 1, 0], sun))
    const lightUp = cross(sun, lightRight)
    const extent = 8
    const center: V3 = [0, 1.8, -1]
    const along = (axis: V3) =>
      axis.reduce((sum, v, k) => sum + v * center[k], 0)
    const lightProj = new Float32Array([
      lightRight[0] / extent,
      lightUp[0] / extent,
      -sun[0] / 32,
      0,
      lightRight[1] / extent,
      lightUp[1] / extent,
      -sun[1] / 32,
      0,
      lightRight[2] / extent,
      lightUp[2] / extent,
      -sun[2] / 32,
      0,
      -along(lightRight) / extent,
      -along(lightUp) / extent,
      0.5 + along(sun) / 32,
      1,
    ])
    U.set({
      viewProj: cam.viewProj,
      lightProj,
      eye: cam.eye,
      forward: cam.forward,
      right: cam.right,
      up: cam.up,
      tangent: Math.tan(FOV / 2),
      aspect: size.width / size.height,
      pixelHeight: size.height,
      softness: 1.1,
      sun,
    })
    U.upload()
    const encoder = device.createCommandEncoder()
    if (shadowDirty) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: {
          view: shadowView,
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      })
      pass.setPipeline(shadowPipeline)
      pass.setBindGroup(0, shadowGroup)
      drawMesh(pass, ground)
      for (const tree of trees) drawMesh(pass, tree.mesh)
      pass.end()
      shadowDirty = false
    }
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: color.createView(),
          resolveTarget: context.getCurrentTexture().createView(),
          clearValue: [0, 0, 0, 1],
          loadOp: 'clear',
          storeOp: 'discard',
        },
      ],
      depthStencilAttachment: {
        view: depth!.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
      },
    })
    pass.setPipeline(skyPipeline)
    pass.setBindGroup(0, skyGroup)
    pass.draw(3)
    pass.setPipeline(surfacePipeline)
    pass.setBindGroup(0, surfaceGroup)
    drawMesh(pass, ground)
    for (const tree of trees) drawMesh(pass, tree.mesh)
    if (retiring) {
      pass.setPipeline(fadePipeline)
      drawMesh(pass, retiring.mesh)
    }
    pass.end()
    device.queue.submit([encoder.finish()])
    const youngest = trees.at(-1)!
    stage.dataset.phase = trees.some((tree) => tree.age < GROW_SECONDS)
      ? 'growing'
      : 'grown'
    stage.dataset.growthSeconds = youngest.age.toFixed(2)
    stage.dataset.generation = String(
      Math.min(6, 1 + Math.floor(youngest.age / 0.7)),
    )
  }
  const animate = () => {
    if (stopAnimation || failed || disposed) return
    let pending = 0
    stopAnimation = loop((dt) => {
      pending += dt
      if (pending < 1 / 30) return
      const step = pending
      pending = 0
      let active = false
      for (const tree of trees) {
        if (tree.age >= GROW_SECONDS) continue
        tree.age = Math.min(GROW_SECONDS, tree.age + step)
        writeState(tree)
        shadowDirty = true
        active ||= tree.age < GROW_SECONDS
      }
      if (retiring) {
        retiring.retirement = (retiring.retirement ?? 0) + step
        writeState(retiring)
        if (retiring.retirement >= 0.7) {
          retiring.mesh.destroy()
          retiring = undefined
        } else active = true
      }
      render()
      if (!active)
        queueMicrotask(() => {
          stopAnimation?.()
          stopAnimation = undefined
        })
    })
  }
  const marks = stage.querySelector<HTMLElement>('.plant-marks')!
  cleanups.push(() => marks.replaceChildren())
  const plantHere = (root: V3, tap?: { x: number; y: number }) => {
    const m = cam.viewProj
    const project = (row: number) =>
      m[row] * root[0] +
      m[row + 4] * root[1] +
      m[row + 8] * root[2] +
      m[row + 12]
    const mark = document.createElement('span')
    mark.className = 'plant-mark'
    mark.style.left = `${tap?.x ?? ((project(0) / project(3) + 1) * size.width) / 2}px`
    mark.style.top = `${tap?.y ?? ((1 - project(1) / project(3)) * size.height) / 2}px`
    marks.append(mark)
    mark.addEventListener('animationend', () => mark.remove(), { once: true })
    plant(root)
    render()
    animate()
  }
  // click で確定するので、縦スクロールの pointercancel は植樹にならない。
  let press: { id: number; x: number; y: number; moved: boolean } | undefined
  let tapped = false
  const down = (event: PointerEvent) => {
    tapped = false
    if (event.isPrimary && event.button === 0)
      press = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
      }
  }
  const move = (event: PointerEvent) => {
    if (
      press?.id === event.pointerId &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 7
    )
      press.moved = true
  }
  const up = (event: PointerEvent) => {
    tapped =
      press?.id === event.pointerId &&
      !press.moved &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) < 7
    press = undefined
  }
  const cancel = () => {
    press = undefined
    tapped = false
  }
  // タッチの pointerup 後に届く pointerleave で、確定済みのタップを消さない。
  const leave = () => {
    if (press) cancel()
  }
  const click = (event: MouseEvent) => {
    if (failed || disposed) return
    if (event.detail === 0) {
      // Enter / Space でも、見えている地面の空いた所へ一本ずつ植える。
      const choices: V3[] = []
      for (let y = -0.7; y <= 0; y += 0.14)
        for (let x = -0.65; x <= 0.65; x += 0.13) {
          const point = groundPoint(cam, x, y)
          if (point) choices.push(point)
        }
      choices.sort((a, b) => {
        const clearance = (p: V3) =>
          Math.min(
            ...trees.map((tree) =>
              Math.hypot(p[0] - tree.root[0], p[2] - tree.root[2]),
            ),
          )
        return clearance(b) - clearance(a)
      })
      if (choices[0]) plantHere(choices[0])
      return
    }
    if (!tapped) return
    tapped = false
    const rect = canvas.getBoundingClientRect()
    const root = groundPoint(
      cam,
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((event.clientY - rect.top) / rect.height) * 2,
    )
    if (root)
      plantHere(root, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      })
  }
  planting.addEventListener('pointerdown', down)
  planting.addEventListener('pointermove', move)
  planting.addEventListener('pointerup', up)
  planting.addEventListener('pointercancel', cancel)
  planting.addEventListener('pointerleave', leave)
  planting.addEventListener('click', click)
  cleanups.push(() => {
    planting.removeEventListener('pointerdown', down)
    planting.removeEventListener('pointermove', move)
    planting.removeEventListener('pointerup', up)
    planting.removeEventListener('pointercancel', cancel)
    planting.removeEventListener('pointerleave', leave)
    planting.removeEventListener('click', click)
  })
  gui = new GUI({ title: '次に植える木' })
  gui.add(settings, 'forks', { '2 本': 2, '3 本': 3 }).name('芽の分岐')
  gui.add(settings, 'angle', 18, 42, 1).name('枝の角度')
  gui.close()
  cleanups.push(
    onReducedMotion((value) => {
      reduced = value
      if (value)
        for (const tree of trees) {
          if (tree.automatic && tree.age === 0) {
            tree.age = GROW_SECONDS
            writeState(tree)
            shadowDirty = true
          }
        }
      render()
    }),
  )
  cleanups.push(
    onResize(stage, (next) => {
      size = new DOMRect(
        0,
        0,
        Math.max(1, next.width),
        Math.max(1, next.height),
      )
      cam = sceneCamera(
        size.width / size.height,
        trees.map((tree) => tree.root),
      )
      for (const tree of [...trees, ...(retiring ? [retiring] : [])]) {
        fitTree(tree)
        writeState(tree)
      }
      shadowDirty = true
      render()
    }),
  )
  cleanups.push(
    onRunningChange((running) => {
      if (!running) cancel()
      else if (dirty) render()
    }),
  )
  render()
  if (trees.some((tree) => tree.age < GROW_SECONDS)) animate()
  stage.classList.add('is-ready')
  stage.setAttribute('aria-busy', 'false')
  await device.queue.onSubmittedWorkDone()
  if (!disposed)
    stage.dataset.firstFrameMs = String(Math.round(performance.now()))
}

try {
  await start(await createGpu(canvas, showError))
} catch (error) {
  if (error instanceof Unsupported) fail()
  else showError(error instanceof Error ? error.message : String(error))
}
