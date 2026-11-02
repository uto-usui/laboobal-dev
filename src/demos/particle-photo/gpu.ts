// WebGPU の資源とパイプライン。1 フレームは、粒を動かす compute → 残像の上に粒を描く → 1/4 の大きさでぼかす（夜は光のにじみ、紙は影）→ 画面へ
import { DRAW, POST, SIM, WG } from './shaders'

/** WebGPU が使えない。代わりの一行を出す */
export class Unsupported extends Error {}

// TypeScript 6 の lib.dom には WebGPU のインターフェースはあるが、フラグの定数と getContext('webgpu') の型がない。
// 実行時にはブラウザのグローバルを読む
declare const GPUBufferUsage: Record<'STORAGE' | 'COPY_DST' | 'UNIFORM', number>
declare const GPUShaderStage: Record<'VERTEX' | 'FRAGMENT' | 'COMPUTE', number>
declare const GPUTextureUsage: Record<
  'RENDER_ATTACHMENT' | 'TEXTURE_BINDING',
  number
>
declare const GPUColorWrite: Record<'ALL', number>

export type Particles = Record<'H0' | 'H1' | 'C0' | 'C1' | 'M', Float32Array>

const PAPER: GPUColor = [0.957, 0.949, 0.933, 1]
const NIGHT: GPUColor = [0, 0, 0, 1]
const HDR: GPUTextureFormat = 'rgba16float'

const compile = async (device: GPUDevice, code: string, label: string) => {
  const module = device.createShaderModule({ code, label })
  const info = await module.getCompilationInfo()
  const errors = info.messages.filter((m) => m.type === 'error')
  if (errors.length)
    throw new Error(
      `WGSL (${label})\n` +
        errors
          .map(
            (e) =>
              `${e.lineNum}:${e.linePos} ${e.message}\n  > ${code.split('\n')[e.lineNum - 1]}`,
          )
          .join('\n'),
    )
  return module
}

export const createRenderer = async (
  canvas: HTMLCanvasElement,
  onError: (message: string) => void,
) => {
  if (!navigator.gpu) throw new Unsupported()
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  })
  // CPU で描く代わりのアダプタでは、数十万の粒は動かない
  if (!adapter || adapter.info.isFallbackAdapter) throw new Unsupported()
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxBufferSize: adapter.limits.maxBufferSize,
    },
  })
  device.lost.then((info) => {
    if (info.reason !== 'destroyed')
      onError(`GPU デバイスを失いました: ${info.message}`)
  })
  device.addEventListener('uncapturederror', (e) =>
    onError((e as GPUUncapturedErrorEvent).error.message),
  )
  const ctx = canvas.getContext('webgpu') as GPUCanvasContext
  const format = navigator.gpu.getPreferredCanvasFormat()
  ctx.configure({ device, format, alphaMode: 'opaque' })

  const [simM, drawM, postM] = await Promise.all([
    compile(device, SIM, 'sim'),
    compile(device, DRAW, 'draw'),
    compile(device, POST, 'post'),
  ])
  // 'auto' だと使っていない binding が落ちるので、粒のバッファの並びは明示する
  const particleLayout = (visibility: number, type: GPUBufferBindingType) =>
    device.createPipelineLayout({
      bindGroupLayouts: [
        device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility, buffer: { type: 'uniform' } },
            ...[1, 2, 3, 4, 5, 6].map((binding) => ({
              binding,
              visibility,
              buffer: {
                type: binding === 1 ? type : ('read-only-storage' as const),
              },
            })),
          ],
        }),
      ],
    })
  const simP = device.createComputePipeline({
    layout: particleLayout(GPUShaderStage.COMPUTE, 'storage'),
    compute: { module: simM, entryPoint: 'sim' },
  })
  const drawLayout = particleLayout(
    GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
    'read-only-storage',
  )
  const add: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one' }
  const drawWith = (
    blend: GPUBlendState,
    auxMask: number = GPUColorWrite.ALL,
  ) =>
    device.createRenderPipeline({
      layout: drawLayout,
      vertex: { module: drawM, entryPoint: 'vs' },
      fragment: {
        module: drawM,
        entryPoint: 'fs',
        targets: [
          { format: HDR, blend },
          {
            format: HDR,
            blend: { color: add, alpha: add },
            writeMask: auxMask,
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    })
  const over: GPUBlendComponent = {
    srcFactor: 'one',
    dstFactor: 'one-minus-src-alpha',
  }
  const drawPaperP = drawWith({ color: over, alpha: over })
  const drawNightP = drawWith({ color: add, alpha: add }, 0) // 夜は厚みと影を使わない
  const postLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: {} },
    ],
  })
  const postPL = device.createPipelineLayout({ bindGroupLayouts: [postLayout] })
  const post = (
    entryPoint: string,
    fmt: GPUTextureFormat,
    extra: GPUColorTargetState[] = [],
  ) =>
    device.createRenderPipeline({
      layout: postPL,
      vertex: { module: postM, entryPoint: 'vsFull' },
      fragment: {
        module: postM,
        entryPoint,
        targets: [{ format: fmt }, ...extra],
      },
      primitive: { topology: 'triangle-list' },
    })
  // 残像の pass は粒と同じ pass なので、厚みの target も持つ（書かない）
  const fadeP = post('fsFade', HDR, [{ format: HDR, writeMask: 0 }])
  const shadowP = post('fsShadowSrc', HDR)
  const presentP = post('fsPresent', format)
  const brightP = post('fsBright', HDR)
  const blurHP = post('fsBlurH', HDR)
  const blurVP = post('fsBlurV', HDR)
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  })
  const ubuf = device.createBuffer({
    size: 160,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  let accum: GPUTexture[] = []
  let bloomTex: GPUTexture[] = []
  let auxTex: GPUTexture | null = null
  let fadeBG: GPUBindGroup[] = []
  let presentBG: GPUBindGroup[] = []
  let brightBG: GPUBindGroup[] = []
  let blurHBG: GPUBindGroup
  let blurVBG: GPUBindGroup
  let accumIdx = 0
  let bufs: Record<'S' | keyof Particles, GPUBuffer> | null = null
  let simBG: GPUBindGroup
  let drawBG: GPUBindGroup

  const clear = (night: boolean) => {
    const enc = device.createCommandEncoder()
    for (const t of accum)
      enc
        .beginRenderPass({
          colorAttachments: [
            {
              view: t.createView(),
              loadOp: 'clear',
              storeOp: 'store',
              clearValue: night ? NIGHT : PAPER,
            },
          ],
        })
        .end()
    device.queue.submit([enc.finish()])
  }

  return {
    /** 描画の解像度（px）を変える。変わったら残像を消す */
    resize(w: number, h: number, night: boolean) {
      if (canvas.width === w && canvas.height === h && accum.length) return
      canvas.width = w
      canvas.height = h
      ;[...accum, ...bloomTex, auxTex].forEach((t) => t?.destroy())
      const tex = (tw: number, th: number) =>
        device.createTexture({
          size: [tw, th],
          format: HDR,
          usage:
            GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        })
      accum = [tex(w, h), tex(w, h)]
      bloomTex = [0, 1].map(() => tex(Math.max(1, w >> 2), Math.max(1, h >> 2)))
      const aux = (auxTex = tex(w, h))
      // 描き込み先と同じテクスチャを読む側に置くと検証で落ちるので、binding 3・4 は使わない側を差す
      const bg = (t: GPUTexture, g: GPUTexture, a = aux) =>
        device.createBindGroup({
          layout: postLayout,
          entries: [
            { binding: 0, resource: { buffer: ubuf } },
            { binding: 1, resource: t.createView() },
            { binding: 2, resource: sampler },
            { binding: 3, resource: g.createView() },
            { binding: 4, resource: a.createView() },
          ],
        })
      fadeBG = accum.map((t) => bg(t, bloomTex[0], bloomTex[1]))
      presentBG = accum.map((t) => bg(t, bloomTex[0]))
      brightBG = accum.map((t) => bg(t, bloomTex[1]))
      blurHBG = bg(bloomTex[0], bloomTex[0])
      blurVBG = bg(bloomTex[1], bloomTex[1])
      clear(night)
    },
    clear,
    /** ぼかしに使う 1/4 のテクスチャの大きさ。uniform に入れる */
    get quarter() {
      return [bloomTex[0]?.width ?? 1, bloomTex[0]?.height ?? 1] as const
    },
    /** 粒のバッファを n 粒分作り直す。位置は画面いっぱいに散らばった所から始める */
    alloc(n: number) {
      if (bufs) Object.values(bufs).forEach((b) => b.destroy())
      const mk = () =>
        device.createBuffer({
          size: n * 16,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        })
      const b = (bufs = {
        S: mk(),
        H0: mk(),
        H1: mk(),
        C0: mk(),
        C1: mk(),
        M: mk(),
      })
      const entries: GPUBindGroupEntry[] = [
        { binding: 0, resource: { buffer: ubuf } },
        ...(['S', 'H0', 'H1', 'C0', 'C1', 'M'] as const).map((k, i) => ({
          binding: i + 1,
          resource: { buffer: b[k] },
        })),
      ]
      simBG = device.createBindGroup({
        layout: simP.getBindGroupLayout(0),
        entries,
      })
      drawBG = device.createBindGroup({
        layout: drawPaperP.getBindGroupLayout(0),
        entries,
      })
      const s = new Float32Array(n * 4)
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const r = 0.4 + Math.sqrt(Math.random()) * 1.4
        s[i * 4] = Math.cos(a) * r * 1.4
        s[i * 4 + 1] = Math.sin(a) * r
      }
      device.queue.writeBuffer(b.S, 0, s)
    },
    upload(particles: Particles) {
      for (const [k, a] of Object.entries(particles))
        device.queue.writeBuffer(bufs![k as keyof Particles], 0, a)
    },
    /** 1 フレーム描く。live は動かす粒の数（割り当てが届くまでは 0）、wash は先頭の下塗りの粒の数 */
    render(uniforms: Float32Array, live: number, wash: number, night: boolean) {
      device.queue.writeBuffer(ubuf, 0, uniforms)
      const enc = device.createCommandEncoder()
      if (live) {
        const cp = enc.beginComputePass()
        cp.setPipeline(simP)
        cp.setBindGroup(0, simBG)
        cp.dispatchWorkgroups(Math.ceil(live / WG))
        cp.end()
      }
      const src = accumIdx
      const dst = 1 - accumIdx
      let rp = enc.beginRenderPass({
        colorAttachments: [
          {
            view: accum[dst].createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: night ? NIGHT : PAPER,
          },
          {
            view: auxTex!.createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: [0, 0, 0, 0],
          },
        ],
      })
      rp.setPipeline(fadeP)
      rp.setBindGroup(0, fadeBG[src])
      rp.draw(3)
      if (live) {
        // 夜は下塗りを描かない
        const first = night ? Math.min(live, wash) : 0
        rp.setPipeline(night ? drawNightP : drawPaperP)
        rp.setBindGroup(0, drawBG)
        rp.draw(6, live - first, 0, first)
      }
      rp.end()
      // 夜は光のにじみ、紙は影を、同じ 1/4 のぼかし経路で作る
      const pass = (
        view: GPUTextureView,
        pipe: GPURenderPipeline,
        group: GPUBindGroup,
      ) => {
        const p = enc.beginRenderPass({
          colorAttachments: [
            {
              view,
              loadOp: 'clear',
              storeOp: 'store',
              clearValue: [0, 0, 0, 1],
            },
          ],
        })
        p.setPipeline(pipe)
        p.setBindGroup(0, group)
        p.draw(3)
        p.end()
      }
      pass(bloomTex[0].createView(), night ? brightP : shadowP, brightBG[dst])
      pass(bloomTex[1].createView(), blurHP, blurHBG)
      pass(bloomTex[0].createView(), blurVP, blurVBG)
      rp = enc.beginRenderPass({
        colorAttachments: [
          {
            view: ctx.getCurrentTexture().createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: [0, 0, 0, 1],
          },
        ],
      })
      rp.setPipeline(presentP)
      rp.setBindGroup(0, presentBG[dst])
      rp.draw(3)
      rp.end()
      device.queue.submit([enc.finish()])
      accumIdx = dst
    },
  }
}

export type Renderer = Awaited<ReturnType<typeof createRenderer>>
