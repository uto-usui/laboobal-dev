/**
 * uniform の構造体を 1 か所に書き、WGSL の struct と、JS から書き込む口の両方を作る。
 * 並びと詰め物（align）を手で合わせると、項目を足したときにずれて、値が黙って入れ違うため
 */

type Kind = 'f32' | 'u32' | 'i32' | 'vec2f' | 'vec3f' | 'vec4f' | 'mat4x4f'

// WGSL の uniform の決まり（size と align）
const LAYOUT: Record<Kind, { size: number; align: number }> = {
  f32: { size: 4, align: 4 },
  u32: { size: 4, align: 4 },
  i32: { size: 4, align: 4 },
  vec2f: { size: 8, align: 8 },
  vec3f: { size: 12, align: 16 },
  vec4f: { size: 16, align: 16 },
  mat4x4f: { size: 64, align: 16 },
}

type Value = number | ArrayLike<number>

export const createUniform = <const F extends Record<string, Kind>>(
  device: GPUDevice,
  name: string,
  fields: F,
) => {
  const offsets = {} as Record<keyof F, number>
  let offset = 0
  for (const [key, kind] of Object.entries(fields) as [keyof F, Kind][]) {
    const { size, align } = LAYOUT[kind]
    offset = Math.ceil(offset / align) * align
    offsets[key] = offset
    offset += size
  }
  const byteLength = Math.ceil(offset / 16) * 16
  const data = new ArrayBuffer(byteLength)
  const f32 = new Float32Array(data)
  const u32 = new Uint32Array(data)
  const i32 = new Int32Array(data)
  const buffer = device.createBuffer({
    label: name,
    size: byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const wgsl = `struct ${name} {\n${Object.entries(fields)
    .map(([key, kind]) => `  ${key}: ${kind},`)
    .join('\n')}\n}\n`

  return {
    buffer,
    /** WGSL の struct の宣言 */
    wgsl,
    /** 値を入れる。upload を呼ぶまで GPU には送らない */
    set(values: Partial<Record<keyof F, Value>>) {
      for (const [key, value] of Object.entries(values) as [keyof F, Value][]) {
        const kind = fields[key] as Kind
        const at = offsets[key] / 4
        const view = kind === 'u32' ? u32 : kind === 'i32' ? i32 : f32
        if (typeof value === 'number') view[at] = value
        else view.set(value, at)
      }
    },
    upload() {
      device.queue.writeBuffer(buffer, 0, data)
    },
  }
}
