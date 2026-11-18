/**
 * 広い空間の空の升まで累積和を取らず、魚のいる升に連結リストを作る。
 * 桶はハッシュで共有するが、近傍探索では元の升の座標を照合する。
 * 個数の固定枠を持たないので、密な群れでも魚をあふれさせない。
 */
import { bindBuffers, storageBuffer, type Gpu } from '../../shared/gpu/device'
import { createUniform } from '../../shared/gpu/uniform'

export interface GridOptions {
  /** 升の数（x, y, z） */
  dims: [number, number, number]
  /** 格子の角の位置 */
  origin: [number, number, number]
  cellSize: number
  /** 並べる魚の最大の数 */
  capacity: number
  /** 1 匹あたりの vec4f の数 */
  stride: number
}

export const createSchoolGrid = async (gpu: Gpu, options: GridOptions) => {
  const { device } = gpu
  const [gx, gy, gz] = options.dims
  const params = createUniform(device, 'Grid', {
    origin: 'vec3f',
    invCell: 'f32',
    gx: 'u32',
    gy: 'u32',
    gz: 'u32',
    n: 'u32',
    stride: 'u32',
  })
  params.set({
    origin: options.origin,
    invCell: 1 / options.cellSize,
    gx,
    gy,
    gz,
    stride: options.stride,
  })
  const heads = storageBuffer(device, 32768 * 4, 'school grid heads')
  const next = storageBuffer(device, options.capacity * 4, 'school grid next')
  const header = /* wgsl */ `
${params.wgsl}
fn gridCell(p: vec3f) -> vec3i {
  let dims = vec3i(i32(grid.gx), i32(grid.gy), i32(grid.gz));
  return clamp(vec3i(floor((p - grid.origin) * grid.invCell)), vec3i(0), dims - 1);
}
fn gridIndex(c: vec3i) -> u32 {
  let linear = (u32(c.z) * grid.gy + u32(c.y)) * grid.gx + u32(c.x);
  let hash = linear * 2654435761u;
  return (hash ^ (hash >> 16u)) & 32767u;
}
fn gridInside(c: vec3i) -> bool {
  return all(c >= vec3i(0)) && all(c < vec3i(i32(grid.gx), i32(grid.gy), i32(grid.gz)));
}
`
  const module = await gpu.compile(
    /* wgsl */ `
${header}
@group(0) @binding(0) var<uniform> grid: Grid;
@group(0) @binding(1) var<storage, read> items: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> heads: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> next: array<u32>;
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= grid.n) { return; }
  let bucket = gridIndex(gridCell(items[i * grid.stride].xyz));
  // 0 を終端にするため、魚の番号は 1 を足して持つ。
  next[i] = atomicExchange(&heads[bucket], i + 1u);
}
`,
    'school grid links',
  )
  const pipeline = device.createComputePipeline({
    label: 'school grid links',
    layout: 'auto',
    compute: { module, entryPoint: 'main' },
  })
  const groups = new Map<GPUBuffer, GPUBindGroup>()
  let lastN = -1
  return {
    encode(encoder: GPUCommandEncoder, items: GPUBuffer, n: number) {
      if (n !== lastN) {
        params.set({ n })
        params.upload()
        lastN = n
      }
      let group = groups.get(items)
      if (!group) {
        group = bindBuffers(device, pipeline.getBindGroupLayout(0), [
          params.buffer,
          items,
          heads,
          next,
        ])
        groups.set(items, group)
      }
      encoder.clearBuffer(heads)
      const pass = encoder.beginComputePass({ label: 'school grid links' })
      pass.setPipeline(pipeline)
      pass.setBindGroup(0, group)
      pass.dispatchWorkgroups(Math.ceil(n / 256))
      pass.end()
    },
    declare(group: number, binding: number) {
      return /* wgsl */ `${header}
@group(${group}) @binding(${binding}) var<uniform> grid: Grid;
@group(${group}) @binding(${binding + 1}) var<storage, read> gridHeads: array<u32>;
@group(${group}) @binding(${binding + 2}) var<storage, read> gridNext: array<u32>;
fn gridHead(c: vec3i) -> u32 { return gridHeads[gridIndex(c)]; }
fn gridLink(i: u32) -> u32 { return gridNext[i]; }
`
    },
    entries: () => [params.buffer, heads, next],
    destroy() {
      params.buffer.destroy()
      heads.destroy()
      next.destroy()
    },
  }
}
