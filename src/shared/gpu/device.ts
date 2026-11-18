/**
 * WebGPU の入口。adapter と device を取り、canvas に結び、エラーを 1 か所に集める。
 * 自然のシミュレーションのシリーズ（nature-*）の共通の土台。部品の一覧は src/shared/gpu/README.md
 */

/** WebGPU が使えない。デモは一行の案内に替える */
export class Unsupported extends Error {}

export interface Gpu {
  device: GPUDevice
  context: GPUCanvasContext
  format: GPUTextureFormat
  /** WGSL をコンパイルする。エラーは行番号とその行を添えて投げる */
  compile: (code: string, label: string) => Promise<GPUShaderModule>
}

export const createGpu = async (
  canvas: HTMLCanvasElement,
  onError: (message: string) => void,
): Promise<Gpu> => {
  if (!navigator.gpu) throw new Unsupported()
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  })
  // CPU で描く代わりのアダプタでは、数万の個体は動かない
  if (!adapter || adapter.info.isFallbackAdapter) throw new Unsupported()
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxBufferSize: adapter.limits.maxBufferSize,
      maxStorageBuffersPerShaderStage:
        adapter.limits.maxStorageBuffersPerShaderStage,
    },
  })
  device.lost.then((info) => {
    if (info.reason !== 'destroyed')
      onError(`GPU デバイスを失いました: ${info.message}`)
  })
  device.addEventListener('uncapturederror', (e) =>
    onError((e as GPUUncapturedErrorEvent).error.message),
  )
  const context = canvas.getContext('webgpu') as GPUCanvasContext | null
  if (!context) throw new Unsupported()
  const format = navigator.gpu.getPreferredCanvasFormat()
  context.configure({ device, format, alphaMode: 'opaque' })

  const compile = async (code: string, label: string) => {
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
  return { device, context, format, compile }
}

/** storage のバッファを作る。中身があれば書き込む。中を確かめるときに読み戻せるよう、COPY_SRC も付ける */
export const storageBuffer = (
  device: GPUDevice,
  size: number,
  label: string,
  data?: ArrayBufferView<ArrayBuffer>,
  extraUsage = 0,
) => {
  const buffer = device.createBuffer({
    label,
    size: Math.max(16, Math.ceil(size / 16) * 16),
    usage:
      GPUBufferUsage.STORAGE |
      GPUBufferUsage.COPY_DST |
      GPUBufferUsage.COPY_SRC |
      extraUsage,
  })
  if (data) device.queue.writeBuffer(buffer, 0, data)
  return buffer
}

/** 2 枚を交互に読み書きするバッファ。step のたびに flip して、読む側（read）と書く側（write）を入れ替える */
export const pingPong = (
  device: GPUDevice,
  size: number,
  label: string,
  data?: ArrayBufferView<ArrayBuffer>,
) => {
  const buffers = [
    storageBuffer(device, size, `${label} 0`, data),
    storageBuffer(device, size, `${label} 1`),
  ]
  let index = 0
  return {
    buffers,
    /** 今の状態がある方の番号（0 か 1）。bind group を 2 組作って、これで選ぶ */
    get index() {
      return index
    },
    get read() {
      return buffers[index]
    },
    get write() {
      return buffers[1 - index]
    },
    flip() {
      index = 1 - index
    },
    destroy() {
      for (const b of buffers) b.destroy()
    },
  }
}

/** buffer を順に binding 0, 1, 2… に並べた bind group */
export const bindBuffers = (
  device: GPUDevice,
  layout: GPUBindGroupLayout,
  buffers: GPUBuffer[],
  label?: string,
) =>
  device.createBindGroup({
    label,
    layout,
    entries: buffers.map((buffer, binding) => ({
      binding,
      resource: { buffer },
    })),
  })
