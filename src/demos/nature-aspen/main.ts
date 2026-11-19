import { fallback } from './fallback'
import { createSettledLeaves } from './contacts'
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
import { createUniform } from '../../shared/gpu/uniform'
import { camera } from '../../shared/gpu/wgsl'
import { onReducedMotion } from '../../shared/motion'
import { touchGate } from '../../shared/touch'
import { onRunningChange } from '../../shared/visibility'
import {
  BRANCH_VERTICES,
  FIELDS,
  LEAF_VERTICES,
  shaders,
  STEM_VERTICES,
} from './shaders'
import { stepLeaves } from './contacts'
import {
  leafPivot,
  type Gust,
  leafBasis,
  type Settings,
  windAt,
} from './simulation'

const stage = document.querySelector<HTMLElement>('.nature-aspen')!
// 静的ビルドのSVGも、この読み込みの乱数種でGPUと同じ枝にそろえる。
for (const [selector, narrow] of [
  ['.still-wide', false],
  ['.still-narrow', true],
] as const) {
  const still = stage.querySelector<HTMLElement>(selector)
  if (still) still.innerHTML = fallback(narrow)
}
const canvas = stage.querySelector<HTMLCanvasElement>('.view')!
const errorBox = stage.querySelector<HTMLElement>('.error')!
const bounds = stage.getBoundingClientRect()
let size = { width: bounds.width, height: bounds.height }
let redraw = () => {}
let stop = () => {}
let failed = false
const cleanups: (() => void)[] = []

const showError = (message: string) => {
  failed = true
  stop()
  stage.classList.remove('is-ready')
  stage.classList.add('is-unsupported')
  errorBox.textContent = message
  errorBox.hidden = false
  console.error(message)
}

cleanups.push(
  onResize(stage, (value) => {
    size = value
    redraw()
  }),
)

const measuring = new URLSearchParams(location.search).has('measure')
const settings: Settings = {
  wind: 1,
  damping: 0.68,
  automatic: true,
  light: 1.2,
}

const start = async (gpu: Gpu) => {
  const { device, context, format } = gpu
  cleanups.push(() => device.destroy())
  const uniform = createUniform(device, 'Aspen', FIELDS)
  // Leaf は vec4f が八つ。最大六枚分を確保し、狭い画面では三枚だけ読む。
  const leafBuffer = storageBuffer(device, 6 * 128, 'aspen leaves')
  const leafData = new Float32Array(6 * 32)
  const module = await gpu.compile(shaders(uniform.wgsl), 'aspen surfaces')
  const sceneLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform', minBindingSize: 144 },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'read-only-storage', minBindingSize: 6 * 128 },
      },
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
  const forestLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
      },
    ],
  })
  const forestSampler = device.createSampler({
    minFilter: 'linear',
    magFilter: 'linear',
  })
  const colorLayout = device.createPipelineLayout({
    bindGroupLayouts: [sceneLayout, shadowLayout, forestLayout],
  })
  const depthLayout = device.createPipelineLayout({
    bindGroupLayouts: [sceneLayout],
  })
  const sceneGroup = bindBuffers(device, sceneLayout, [
    uniform.buffer,
    leafBuffer,
  ])
  const shadow = device.createTexture({
    label: 'aspen soft shadow',
    size: [1024, 1024],
    format: 'depth32float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })
  const shadowGroup = device.createBindGroup({
    layout: shadowLayout,
    entries: [
      { binding: 0, resource: shadow.createView() },
      {
        binding: 1,
        resource: device.createSampler({
          compare: 'less-equal',
          minFilter: 'linear',
          magFilter: 'linear',
        }),
      },
    ],
  })
  const colorPipeline = (vertex: string, background = false) =>
    device.createRenderPipelineAsync({
      label: `aspen ${vertex}`,
      layout: colorLayout,
      vertex: { module, entryPoint: vertex },
      fragment: {
        module,
        entryPoint: background ? 'background' : 'surface',
        targets: [{ format }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: !background,
        depthCompare: background ? 'always' : 'less',
      },
      multisample: { count: 4 },
    })
  const depthPipeline = (vertex: string) =>
    device.createRenderPipelineAsync({
      label: `aspen ${vertex}`,
      layout: depthLayout,
      vertex: { module, entryPoint: vertex },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        format: 'depth32float',
        depthWriteEnabled: true,
        depthCompare: 'less',
        depthBias: 1,
        depthBiasSlopeScale: 1,
      },
    })
  const [
    backP,
    leafP,
    branchP,
    stemP,
    leafShadowP,
    branchShadowP,
    stemShadowP,
  ] = await Promise.all([
    colorPipeline('vsFull', true),
    colorPipeline('vsLeaf'),
    colorPipeline('vsBranch'),
    colorPipeline('vsStem'),
    depthPipeline('shadowLeaf'),
    depthPipeline('shadowBranch'),
    depthPipeline('shadowStem'),
  ])

  const bakeForestP = await device.createRenderPipelineAsync({
    label: 'aspen static forest',
    layout: depthLayout,
    vertex: { module, entryPoint: 'vsFull' },
    fragment: {
      module,
      entryPoint: 'bakeForest',
      targets: [{ format: 'rgba16float' }],
    },
    primitive: { topology: 'triangle-list' },
  })
  let narrow = size.width < 600
  let leaves = createSettledLeaves(narrow)
  let time = 0
  let nextWind = 1.8
  let automaticIndex = 0
  let branchAngle = 0
  let branchVelocity = 0
  let gusts: Gust[] = []
  let quietUntil = 0
  let manualWind = 0
  let lastInput = 0
  let reduced = false
  let stopLoop: (() => void) | undefined
  const stepper = fixedStepper(1 / 120, 2)
  const gustFrom = (direction: number) =>
    Math.min(...leaves.map((leaf) => leaf.x * direction)) - 0.7

  const advance = () => {
    time += stepper.step
    if (
      !reduced &&
      !drag &&
      time >= quietUntil &&
      settings.automatic &&
      time >= nextWind
    ) {
      gusts.push({
        at: time,
        direction: automaticIndex % 2 === 0 ? 1 : -1,
        strength: 1.65 + (automaticIndex % 3) * 0.13,
        from: gustFrom(automaticIndex % 2 === 0 ? 1 : -1),
      })
      automaticIndex++
      nextWind = time + 10.5
    }
    gusts = gusts.filter((g) => time - g.at < 3.2)
    // 手を止めたら操作の風だけを短く減衰させる。自動のそよ風は混ぜない。
    manualWind *= Math.exp(-stepper.step * 5)
    const idle = !reduced && !drag && time >= quietUntil && settings.automatic
    let load = 0
    const winds = leaves.map((leaf) => {
      const wind = Math.max(
        -3.5,
        Math.min(
          3.5,
          (gusts.reduce((sum, g) => sum + windAt(g, time, leaf.x), 0) +
            manualWind +
            (idle
              ? 0.17 * Math.sin(time * 3.7 + leaf.phase) +
                0.11 * Math.sin(time * 6.1 + leaf.phase * 1.3)
              : 0)) *
            settings.wind,
        ),
      )
      load += wind
      return wind
    })
    stepLeaves(leaves, winds, stepper.step, settings)
    branchVelocity +=
      (load * 0.027 - branchAngle * 2.2 - branchVelocity * 1.65) * stepper.step
    branchAngle += branchVelocity * stepper.step
  }

  let msaa: GPUTexture | undefined
  let depth: GPUTexture | undefined
  let forestTexture: GPUTexture | undefined
  let forestGroup: GPUBindGroup | undefined
  let forestDirty = true
  let width = 0
  let height = 0
  const render = () => {
    if (failed || size.width < 1 || size.height < 1) return
    const w = Math.max(1, Math.round(size.width * pixelRatio()))
    const h = Math.max(1, Math.round(size.height * pixelRatio()))
    if (w !== width || h !== height) {
      width = w
      height = h
      // 林は動かない。光の明るさは合成時に掛け、背景の重い計算はリサイズ時だけ行う。
      forestTexture?.destroy()
      forestTexture = device.createTexture({
        size: [w, h],
        format: 'rgba16float',
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      })
      forestGroup = device.createBindGroup({
        layout: forestLayout,
        entries: [
          { binding: 0, resource: forestTexture.createView() },
          { binding: 1, resource: forestSampler },
        ],
      })
      forestDirty = true
      canvas.width = w
      canvas.height = h
      msaa?.destroy()
      depth?.destroy()
      msaa = device.createTexture({
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
    const aspect = size.width / size.height
    const halfHeight = Math.max(3, 2.65 / aspect)
    // 正射影なので、入れ物の高さが変わっても葉の大小関係が変わらない。
    uniform.set({
      viewProj: [
        1 / (halfHeight * aspect),
        0,
        0,
        0,
        0,
        1 / halfHeight,
        0,
        0,
        0,
        0,
        -0.04,
        0,
        0,
        0,
        0.5,
        1,
      ],
      lightProj: camera([-3, 7, -10], [0, 0, 0], 1.0, 1, 1, 30).viewProj,
      aspect,
      leafCount: leaves.length,
      branch: branchAngle,
      light: settings.light,
    })
    for (let i = 0; i < leaves.length; i++) {
      const leaf = leaves[i]
      const basis = leafBasis(leaf, branchAngle)
      leafData.set(
        [
          ...leafPivot(leaf, branchAngle),
          leaf.stem,
          ...basis[0],
          leaf.width,
          ...basis[1],
          leaf.length,
          ...basis[2],
          0.07 + leaf.bend,
          ...leaf.color,
          0.65 + i * 0.05,
          leaf.phase,
          leaf.z,
          leaf.x,
          Math.cos(leaf.rest[2]) < 0 ? 1 : -1,
          ...leaf.contact
            .slice(0, 3)
            .map((v, j) =>
              j === 0
                ? v * Math.cos(branchAngle) -
                  leaf.contact[1] * Math.sin(branchAngle)
                : j === 1
                  ? leaf.contact[0] * Math.sin(branchAngle) +
                    v * Math.cos(branchAngle)
                  : v,
            ),
          leaf.contact[3],
          ...leaf.shape,
        ],
        i * 32,
      )
    }
    uniform.upload()
    device.queue.writeBuffer(leafBuffer, 0, leafData)
    const encoder = device.createCommandEncoder()
    if (forestDirty) {
      const backgroundPass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: forestTexture!.createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          },
        ],
      })
      backgroundPass.setPipeline(bakeForestP)
      backgroundPass.setBindGroup(0, sceneGroup)
      backgroundPass.draw(3)
      backgroundPass.end()
      forestDirty = false
    }
    const shadowPass = encoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: {
        view: shadow.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    })
    shadowPass.setBindGroup(0, sceneGroup)
    for (const [p, vertices, instances] of [
      [leafShadowP, LEAF_VERTICES, leaves.length],
      [branchShadowP, BRANCH_VERTICES, 1],
      [stemShadowP, STEM_VERTICES, leaves.length],
    ] as const) {
      shadowPass.setPipeline(p)
      shadowPass.draw(vertices, instances)
    }
    shadowPass.end()
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: msaa!.createView(),
          resolveTarget: context.getCurrentTexture().createView(),
          clearValue: [0.2, 0.2, 0.15, 1],
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
    pass.setBindGroup(0, sceneGroup)
    pass.setBindGroup(1, shadowGroup)
    pass.setBindGroup(2, forestGroup!)
    for (const [p, vertices, instances] of [
      [backP, 3, 1],
      [branchP, BRANCH_VERTICES, 1],
      [stemP, STEM_VERTICES, leaves.length],
      [leafP, LEAF_VERTICES, leaves.length],
    ] as const) {
      pass.setPipeline(p)
      pass.draw(vertices, instances)
    }
    pass.end()
    device.queue.submit([encoder.finish()])
    stage.classList.add('is-ready')
  }

  const still = () => {
    leaves = createSettledLeaves(narrow)
    time = 0
    branchAngle = 0
    branchVelocity = 0
    gusts = []
    manualWind = 0
    quietUntil = 0
    nextWind = time + 8
    render()
  }

  redraw = () => {
    const nextNarrow = size.width < 600
    if (narrow !== nextNarrow) {
      narrow = nextNarrow
      leaves = createSettledLeaves(narrow)
      if (reduced) {
        still()
        return
      }
    }
    render()
  }

  let drag:
    | { id: number; x: number; y: number; at: number; active: boolean }
    | undefined
  const claimWind = () => {
    // 見本の風を消して、触っている間と離してから4秒は手の風だけにする。
    gusts = []
    quietUntil = time + 4
    nextWind = Math.max(nextWind, quietUntil + 1.8)
  }
  const sendWind = (direction: number, strength: number) => {
    if (failed) return
    claimWind()
    gusts.push({ at: time, direction, strength, from: gustFrom(direction) })
  }
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || failed || drag) return
    claimWind()
    manualWind = 0
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      at: performance.now(),
      active: false,
    }
    canvas.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (
      !drag.active &&
      (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy) * 1.15)
    )
      return
    const now = performance.now()
    const seconds = Math.max(0.008, (now - drag.at) / 1000)
    // 距離の閾値を越えた瞬間から、符号付きの速度を風圧に渡す。
    // 強い横なぞりはねじれを90度以上にし、裏面が見える。
    manualWind = Math.sign(dx) * Math.min(3.5, Math.abs(dx) / seconds / 420)
    claimWind()
    drag = {
      id: drag.id,
      x: event.clientX,
      y: event.clientY,
      at: now,
      active: true,
    }
    lastInput = now
    if (reduced) {
      // 自走する余韻は足さず、指が動いた時間ぶんだけ物理を進めて一枚描く。
      for (
        let i = 0;
        i < Math.min(4, Math.max(1, Math.ceil(seconds / stepper.step)));
        i++
      )
        advance()
      render()
    }
  }
  const up = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return
    move(event)
    claimWind()
    if (reduced) manualWind = 0
    drag = undefined
  }
  const cancel = () => {
    if (drag) claimWind()
    drag = undefined
    manualWind = 0
  }
  const key = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      if (reduced) {
        claimWind()
        manualWind = event.key === 'ArrowRight' ? 2.6 : -2.6
        for (let i = 0; i < 4; i++) advance()
        manualWind = 0
        render()
      } else sendWind(event.key === 'ArrowRight' ? 1 : -1, 2.6)
    }
  }
  cleanups.push(touchGate(canvas))
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', cancel)
  canvas.addEventListener('lostpointercapture', cancel)
  canvas.addEventListener('keydown', key)
  cleanups.push(() => {
    canvas.removeEventListener('pointerdown', down)
    canvas.removeEventListener('pointermove', move)
    canvas.removeEventListener('pointerup', up)
    canvas.removeEventListener('pointercancel', cancel)
    canvas.removeEventListener('lostpointercapture', cancel)
    canvas.removeEventListener('keydown', key)
  })
  cleanups.push(
    onRunningChange((running) => {
      if (!running) cancel()
      stepper.reset()
    }),
  )

  const gui = new GUI({ title: '設定', width: 220 })
  gui.add(settings, 'wind', 0.3, 1.5, 0.05).name('風の強さ')
  gui.add(settings, 'damping', 0.5, 1.4, 0.02).name('揺れの収まり')
  gui
    .add(settings, 'automatic')
    .name('ときどき吹く風')
    .onChange(() => {
      nextWind = time + 3
    })
  gui.add(settings, 'light', 0.8, 1.6, 0.05).name('光の明るさ').onChange(render)
  gui.close()
  cleanups.push(() => gui.destroy())
  stop = () => {
    stopLoop?.()
    stopLoop = undefined
    gui.hide()
  }
  cleanups.push(
    onReducedMotion((value) => {
      reduced = value
      stage.classList.toggle('is-reduced', value)
      stopLoop?.()
      stopLoop = undefined
      cancel()
      stepper.reset()
      if (failed) return
      if (reduced) still()
      else {
        render()
        stopLoop = loop((dt) => {
          if (performance.now() - lastInput > 100) manualWind = 0
          if (drag) quietUntil = time + 4
          const started = measuring ? performance.now() : 0
          for (let steps = stepper.advance(dt); steps > 0; steps--) advance()
          if (measuring)
            performance.measure('aspen-physics', {
              start: started,
              duration: performance.now() - started,
            })
          render()
        })
      }
    }),
  )
  cleanups.push(() => {
    stopLoop?.()
    msaa?.destroy()
    depth?.destroy()
    forestTexture?.destroy()
    shadow.destroy()
    leafBuffer.destroy()
    uniform.buffer.destroy()
  })
}

try {
  await start(await createGpu(canvas, showError))
} catch (error) {
  if (error instanceof Unsupported) stage.classList.add('is-unsupported')
  else showError(error instanceof Error ? error.message : String(error))
}

window.addEventListener(
  'pagehide',
  () => {
    stop()
    for (const dispose of cleanups.reverse()) dispose()
  },
  { once: true },
)
