import GUI from 'lil-gui'
import { isCoarsePointer, loop, onResize, pixelRatio } from '../../shared/dom'
import {
  bindBuffers,
  createGpu,
  pingPong,
  storageBuffer,
  Unsupported,
  type Gpu,
} from '../../shared/gpu/device'
import { fixedStepper } from '../../shared/gpu/stepper'
import { createUniform } from '../../shared/gpu/uniform'
import { onReducedMotion } from '../../shared/motion'
import { ASSOCIATIONS, BACKGROUND_STARS } from './appearance'
import { initialState, MASS_COUNT, SOFTENING, STEP } from './initial'
import { createControls } from './controls'
import { REAL_STEP } from './interaction'
import {
  background,
  composite,
  deformation,
  surface,
  gravity,
  SIM_FIELDS,
  VIEW_FIELDS,
  CONTROL_FIELDS,
  manipulation,
  tracking,
  following,
} from './shaders'

const stage = document.querySelector<HTMLElement>('.nature-galaxy-tides')!
const canvas = stage.querySelector<HTMLCanvasElement>('.view')!
const errorBox = stage.querySelector<HTMLElement>('.error')!
const path = stage.querySelector<SVGPolylineElement>('.trajectory polyline')!
const P = { exposure: 0.65 }
let failed = false
let stop: (() => void) | undefined
let gui: GUI | undefined
let size = { w: 800, h: 450, cssW: 800, cssH: 450 }
let redraw = () => {}

const showError = (message: string) => {
  failed = true
  stop?.()
  gui?.destroy()
  stage.classList.add('is-failed')
  errorBox.textContent = message
  errorBox.hidden = false
  console.error(message)
}

onResize(stage, ({ width, height }) => {
  const ratio = pixelRatio()
  size = {
    w: Math.max(1, Math.round(width * ratio)),
    h: Math.max(1, Math.round(height * ratio)),
    cssW: Math.max(1, width),
    cssH: Math.max(1, height),
  }
  redraw()
})

const start = async (gpu: Gpu) => {
  const { device, context, format } = gpu
  const count = isCoarsePointer() || screen.width < 600 ? 16384 : 32768
  const sim = createUniform(device, 'Sim', SIM_FIELDS)
  sim.set({ dt: STEP, softening2: SOFTENING ** 2, masses: MASS_COUNT, count })
  sim.upload()
  const view = createUniform(device, 'View', VIEW_FIELDS)
  const control = createUniform(device, 'Control', CONTROL_FIELDS)
  const modules = await Promise.all([
    gpu.compile(gravity(sim.wgsl), 'galaxy gravity'),
    gpu.compile(surface(view.wgsl), 'galaxy stellar surface'),
    gpu.compile(composite(view.wgsl), 'galaxy composite'),
    gpu.compile(background(view.wgsl), 'galaxy background stars'),
    gpu.compile(deformation(view.wgsl), 'galaxy surface deformation'),
    gpu.compile(manipulation(control.wgsl), 'galaxy manipulation'),
    gpu.compile(tracking(view.wgsl), 'galaxy core tracking'),
    gpu.compile(following(control.wgsl), 'galaxy grab force'),
  ])
  const compute = (entryPoint: string) =>
    device.createComputePipeline({
      label: `galaxy ${entryPoint}`,
      layout: 'auto',
      compute: { module: modules[0], entryPoint },
    })
  const initP = compute('initialize')
  const stepP = compute('advance')
  const surfacePipeline = (vertex: string, fragment: string) =>
    device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: modules[1], entryPoint: vertex },
      fragment: {
        module: modules[1],
        entryPoint: fragment,
        targets: [
          {
            format: 'rgba16float',
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },
    })
  const measureP = device.createComputePipeline({
    layout: 'auto',
    compute: { module: modules[4], entryPoint: 'measure' },
  })
  const relocateP = device.createComputePipeline({
    layout: 'auto',
    compute: { module: modules[5], entryPoint: 'relocate' },
  })
  const followP = device.createComputePipeline({
    layout: 'auto',
    compute: { module: modules[7], entryPoint: 'follow' },
  })
  const releaseP = device.createComputePipeline({
    layout: 'auto',
    compute: { module: modules[7], entryPoint: 'release' },
  })
  const trackP = device.createComputePipeline({
    layout: 'auto',
    compute: { module: modules[6], entryPoint: 'track' },
  })
  const lightP = surfacePipeline('vsSurface', 'fsSurface')
  const coreP = surfacePipeline('vsCore', 'fsCore')
  const associationP = surfacePipeline('vsAssociation', 'fsAssociation')
  const composeP = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: modules[2], entryPoint: 'vsFull' },
    fragment: { module: modules[2], entryPoint: 'fs', targets: [{ format }] },
  })
  const starsP = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: modules[3], entryPoint: 'vs' },
    fragment: {
      module: modules[3],
      entryPoint: 'fs',
      targets: [
        {
          format,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
          },
        },
      ],
    },
  })
  const sampler = device.createSampler({
    minFilter: 'linear',
    magFilter: 'linear',
  })
  const mass = pingPong(device, MASS_COUNT * 32, 'galaxy mass')
  const light = pingPong(device, count * 32, 'galaxy light')
  const seed = initialState(count, 0.5)
  const material = storageBuffer(
    device,
    count * 16,
    'galaxy material coordinates',
  )
  const indices = storageBuffer(
    device,
    seed.indices.byteLength,
    'galaxy surface indices',
    seed.indices,
  )
  const faceCount = seed.indices.length / 3
  const stretches = storageBuffer(
    device,
    faceCount * 4,
    'galaxy face stretches',
  )
  const neighbors = storageBuffer(
    device,
    seed.neighbors.byteLength,
    'galaxy face neighbors',
    seed.neighbors,
  )
  const cores = storageBuffer(
    device,
    64,
    'galaxy core positions and velocities',
  )
  const bulkMotion = storageBuffer(
    device,
    32,
    'galaxy bulk velocity corrections',
  )
  const followGroups = [0, 1].map((k) =>
    bindBuffers(device, followP.getBindGroupLayout(0), [
      control.buffer,
      light.buffers[k],
      bulkMotion,
      mass.buffers[k],
    ]),
  )
  const releaseGroups = [0, 1].map((k) =>
    bindBuffers(device, releaseP.getBindGroupLayout(0), [
      control.buffer,
      light.buffers[k],
      bulkMotion,
    ]),
  )
  const readback = device.createBuffer({
    label: 'galaxy core readback',
    size: 64,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })
  let dirty = true
  const controls = createControls(canvas, path, seed.light, () => {
    dirty = true
  })
  const relocateGroups = [mass, light].map((bodies) =>
    [0, 1].map((k) =>
      bindBuffers(device, relocateP.getBindGroupLayout(0), [
        control.buffer,
        bodies.buffers[k],
        bodies.buffers[1 - k],
        bulkMotion,
      ]),
    ),
  )
  const trackGroups = [0, 1].map((k) =>
    bindBuffers(device, trackP.getBindGroupLayout(0), [
      view.buffer,
      light.buffers[k],
      cores,
    ]),
  )
  const associationGroups = [0, 1].map((k) =>
    bindBuffers(device, associationP.getBindGroupLayout(0), [
      view.buffer,
      light.buffers[1 - k],
      light.buffers[k],
    ]),
  )
  const groups = (pipeline: GPUComputePipeline) =>
    [0, 1].map((k) => ({
      mass: bindBuffers(device, pipeline.getBindGroupLayout(0), [
        sim.buffer,
        mass.buffers[k],
        mass.buffers[k],
        mass.buffers[1 - k],
        ...(pipeline === stepP ? [bulkMotion] : []),
      ]),
      light: bindBuffers(device, pipeline.getBindGroupLayout(0), [
        sim.buffer,
        mass.buffers[k],
        light.buffers[k],
        light.buffers[1 - k],
        ...(pipeline === stepP ? [bulkMotion] : []),
      ]),
    }))
  const initGroups = groups(initP)
  const stepGroups = groups(stepP)
  let lightTexture: GPUTexture | undefined
  let coreGroups: GPUBindGroup[] = []
  let lightGroups: GPUBindGroup[] = []
  let measureGroups: GPUBindGroup[] = []
  let composeGroup: GPUBindGroup
  let starsGroup: GPUBindGroup
  const entry = (binding: number, resource: GPUBindingResource) => ({
    binding,
    resource,
  })

  let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  let hold = 0
  let carry = 0
  let waiting = false
  const stepper = fixedStepper(REAL_STEP, 3)
  let camera = controls.frame(size.cssW, size.cssH, 0, reduced)

  const updateView = () => {
    const aspect = size.cssW / size.cssH
    const w = Math.min(1920, size.w)
    const h = Math.max(1, Math.round(w / aspect))
    view.set({
      ...camera,
      resolution: [size.cssW, size.cssH],
      fraction: reduced ? 1 : Math.min(1, carry / REAL_STEP),
      exposure: P.exposure,
      count,
      faces: faceCount,
    })
    view.upload()
    if (
      !lightTexture ||
      lightTexture.width !== w ||
      lightTexture.height !== h
    ) {
      lightTexture?.destroy()
      const texture = (label: string) =>
        device.createTexture({
          label,
          size: [w, h],
          format: 'rgba16float',
          usage:
            GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        })
      lightTexture = texture('galaxy radiance')
      coreGroups = [0, 1].map((k) =>
        bindBuffers(device, coreP.getBindGroupLayout(0), [
          view.buffer,
          light.buffers[1 - k],
          light.buffers[k],
        ]),
      )
      measureGroups = [0, 1].map((k) =>
        device.createBindGroup({
          layout: measureP.getBindGroupLayout(0),
          entries: [
            entry(0, { buffer: view.buffer }),
            entry(1, { buffer: light.buffers[1 - k] }),
            entry(2, { buffer: light.buffers[k] }),
            entry(3, { buffer: material }),
            entry(4, { buffer: indices }),
            entry(5, { buffer: stretches }),
          ],
        }),
      )
      lightGroups = [0, 1].map((k) =>
        device.createBindGroup({
          layout: lightP.getBindGroupLayout(0),
          entries: [
            entry(0, { buffer: view.buffer }),
            entry(1, { buffer: light.buffers[1 - k] }),
            entry(2, { buffer: light.buffers[k] }),
            entry(3, { buffer: material }),
            entry(4, { buffer: indices }),
            entry(5, { buffer: stretches }),
            entry(6, { buffer: neighbors }),
          ],
        }),
      )
      composeGroup = device.createBindGroup({
        layout: composeP.getBindGroupLayout(0),
        entries: [
          entry(0, { buffer: view.buffer }),
          entry(1, lightTexture.createView()),
          entry(2, sampler),
        ],
      })
      starsGroup = device.createBindGroup({
        layout: starsP.getBindGroupLayout(0),
        entries: [
          entry(0, { buffer: view.buffer }),
          entry(1, lightTexture.createView()),
          entry(2, sampler),
        ],
      })
    }
    if (canvas.width !== size.w || canvas.height !== size.h) {
      canvas.width = size.w
      canvas.height = size.h
    }
  }

  const encode = (
    encoder: GPUCommandEncoder,
    n: number,
    initialize = false,
  ) => {
    const pass = encoder.beginComputePass({ label: 'galaxy gravity' })
    for (let i = 0; i < n; i++) {
      if (!initialize) {
        pass.setPipeline(followP)
        pass.setBindGroup(0, followGroups[light.index])
        pass.dispatchWorkgroups(2)
      }
      pass.setPipeline(initialize ? initP : stepP)
      const group = (initialize ? initGroups : stepGroups)[mass.index]
      // 両方とも更新前の質量を読む。光だけが半刻み先の重力を読まないよう、交換は最後に行う。
      pass.setBindGroup(0, group.light)
      pass.dispatchWorkgroups(count / 64)
      pass.setBindGroup(0, group.mass)
      pass.dispatchWorkgroups(MASS_COUNT / 64)
      mass.flip()
      light.flip()
    }
    pass.end()
  }

  const render = (encoder: GPUCommandEncoder) => {
    updateView()
    const measurePass = encoder.beginComputePass({
      label: 'galaxy surface visibility',
    })
    measurePass.setPipeline(measureP)
    measurePass.setBindGroup(0, measureGroups[light.index])
    measurePass.dispatchWorkgroups(Math.ceil(faceCount / 64))
    measurePass.end()
    const radiancePass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: lightTexture!.createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: [0, 0, 0, 0],
        },
      ],
    })
    radiancePass.setPipeline(lightP)
    radiancePass.setBindGroup(0, lightGroups[light.index])
    // ちぎれた面だけ外す。星の集まりは面の抑制を使わず別に描く。
    radiancePass.draw(seed.indices.length)
    radiancePass.setPipeline(associationP)
    radiancePass.setBindGroup(0, associationGroups[light.index])
    radiancePass.draw(6, ASSOCIATIONS * 2)
    radiancePass.setPipeline(coreP)
    radiancePass.setBindGroup(0, coreGroups[light.index])
    radiancePass.draw(6, 2)
    radiancePass.end()
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: [0, 0, 0, 1],
        },
      ],
    })
    pass.setPipeline(composeP)
    pass.setBindGroup(0, composeGroup)
    pass.draw(3)
    pass.setPipeline(starsP)
    pass.setBindGroup(0, starsGroup)
    pass.draw(6, BACKGROUND_STARS)
    pass.end()
  }

  device.queue.writeBuffer(mass.read, 0, seed.mass)
  device.queue.writeBuffer(light.read, 0, seed.light)
  device.queue.writeBuffer(material, 0, seed.material)
  const initialEncoder = device.createCommandEncoder()
  encode(initialEncoder, 1, true)
  initialEncoder.copyBufferToBuffer(light.read, 0, light.write, 0, count * 32)
  render(initialEncoder)
  device.queue.submit([initialEncoder.finish()])

  gui = new GUI({ title: '設定' })
  gui
    .add(P, 'exposure', 0.3, 1.2, 0.01)
    .name('光の明るさ')
    .onChange(() => {
      dirty = true
    })
  gui.close()
  redraw = () => {
    dirty = true
  }
  const offMotion = onReducedMotion((value) => {
    reduced = value
    stepper.reset()
    carry = 0
    dirty = true
  })

  stop = loop((dt) => {
    if (failed || waiting) return
    let n = 0
    // 初回の待ち時間も、触り始めたら終えて世界を動かし続ける。
    if (controls.active) hold = 2.2
    if (!reduced) {
      hold += dt
      if (hold >= 2.2) {
        n = stepper.advance(Math.min(dt, 0.05))
        carry =
          n === 3 ? 0 : Math.max(0, carry + Math.min(dt, 0.05) - n * REAL_STEP)
      }
    } else {
      stepper.reset()
      carry = 0
    }
    camera = controls.frame(size.cssW, size.cssH, dt, reduced)
    const shift = reduced ? controls.consumeReducedShift() : undefined
    if (n === 0 && !dirty && !shift && !controls.settling) return
    const released = controls.consumeRelease()
    const release = reduced ? undefined : released
    control.set({
      ...controls.force(),
      shift: shift ?? [0, 0, 0, 0],
      releaseVelocity: release ? [...release, 1] : [0, 0, 0, 0],
    })
    control.upload()
    const encoder = device.createCommandEncoder()
    if (shift || release) {
      const pass = encoder.beginComputePass({
        label: 'galaxy move or release',
      })
      if (release) {
        pass.setPipeline(releaseP)
        pass.setBindGroup(0, releaseGroups[light.index])
        pass.dispatchWorkgroups(1)
      }
      pass.setPipeline(relocateP)
      pass.setBindGroup(0, relocateGroups[0][mass.index])
      pass.dispatchWorkgroups(MASS_COUNT / 64)
      pass.setBindGroup(0, relocateGroups[1][light.index])
      pass.dispatchWorkgroups(count / 64)
      pass.end()
      mass.flip()
      light.flip()
      encoder.copyBufferToBuffer(light.read, 0, light.write, 0, count * 32)
      carry = 0
    }
    if (n > 0) encode(encoder, n)
    render(encoder)
    const trackPass = encoder.beginComputePass({
      label: 'galaxy core tracking',
    })
    trackPass.setPipeline(trackP)
    trackPass.setBindGroup(0, trackGroups[light.index])
    trackPass.dispatchWorkgroups(2)
    trackPass.end()
    encoder.copyBufferToBuffer(cores, 0, readback, 0, 64)
    device.queue.submit([encoder.finish()])
    dirty = false
    waiting = true
    // 芯の 64 バイトだけを読む。読み戻し中に次の GPU フレームを積まない。
    void readback
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        controls.snapshot(new Float32Array(readback.getMappedRange()))
        readback.unmap()
        waiting = false
      })
      .catch((error) => {
        if (!failed) showError(String(error))
      })
  })
  window.addEventListener(
    'pagehide',
    () => {
      stop?.()
      gui?.destroy()
      mass.destroy()
      light.destroy()
      material.destroy()
      indices.destroy()
      stretches.destroy()
      neighbors.destroy()
      cores.destroy()
      readback.destroy()
      bulkMotion.destroy()
      control.buffer.destroy()
      controls.destroy()
      offMotion()
      sim.buffer.destroy()
      view.buffer.destroy()
      lightTexture?.destroy()
      device.destroy()
    },
    { once: true },
  )
}

try {
  await start(await createGpu(canvas, showError))
} catch (error) {
  if (error instanceof Unsupported) {
    failed = true
    stage.classList.add('is-unsupported')
  } else showError(error instanceof Error ? error.message : String(error))
}
