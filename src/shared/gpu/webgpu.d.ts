// TypeScript 6 の lib.dom には WebGPU のインターフェースはあるが、フラグの定数がない。実行時にはブラウザのグローバルを読む
declare const GPUBufferUsage: Record<
  | 'MAP_READ'
  | 'MAP_WRITE'
  | 'COPY_SRC'
  | 'COPY_DST'
  | 'INDEX'
  | 'VERTEX'
  | 'UNIFORM'
  | 'STORAGE'
  | 'INDIRECT'
  | 'QUERY_RESOLVE',
  number
>
declare const GPUShaderStage: Record<'VERTEX' | 'FRAGMENT' | 'COMPUTE', number>
declare const GPUTextureUsage: Record<
  | 'COPY_SRC'
  | 'COPY_DST'
  | 'TEXTURE_BINDING'
  | 'STORAGE_BINDING'
  | 'RENDER_ATTACHMENT',
  number
>
declare const GPUColorWrite: Record<
  'RED' | 'GREEN' | 'BLUE' | 'ALPHA' | 'ALL',
  number
>
declare const GPUMapMode: Record<'READ' | 'WRITE', number>
