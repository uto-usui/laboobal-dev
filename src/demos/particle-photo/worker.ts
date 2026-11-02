// CPU 側の重い処理（写真の解析・粒の割り当て）はこの Worker で行い、描画を止めない。
// - 標本化: 構造テンソル（Kyprianidis et al. 2009 の異方性 Kuwahara と同じ作り）で輪郭の向きと強さを測り、
//   輪郭ほど密に・平らな所ほど大きく粒を置く（Hertzmann 1998 の「平らな所は太い筆」）
// - 割り当て: assign.ts
import { assign, washCount, type Mode } from './assign'

export type ToWorker =
  | { type: 'add'; id: number; bitmap: ImageBitmap }
  | {
      type: 'go'
      id: number
      n: number
      mode: Mode
      cw: number
      keepColor: boolean
      seq: number
    }

export type FromWorker =
  | {
      type: 'assigned'
      seq: number
      id: number
      data: Float32Array
      aspect: number
      fresh: boolean
      prepMs: number
      assignMs: number
    }
  | { type: 'error'; message: string }

// tsconfig は DOM の型で見ているので、Worker の側で使うものだけ型を付ける
const scope = self as unknown as {
  postMessage(message: FromWorker, transfer?: Transferable[]): void
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null
}

const bitmaps = new Map<number, ImageBitmap>()
const cache = new Map<number, { data: Float32Array; aspect: number }>()
let cacheN = 0
let cur: Float32Array | null = null

const boxBlur = (src: Float32Array, w: number, h: number, r: number) => {
  const tmp = new Float32Array(src.length)
  const dst = new Float32Array(src.length)
  const k = 1 / (2 * r + 1)
  for (let y = 0; y < h; y++) {
    let acc = 0
    const row = y * w
    for (let x = -r; x <= r; x++)
      acc += src[row + Math.min(w - 1, Math.max(0, x))]
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc * k
      acc +=
        src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)]
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0
    for (let y = -r; y <= r; y++)
      acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc * k
      acc +=
        tmp[Math.min(h - 1, y + r + 1) * w + x] -
        tmp[Math.max(0, y - r) * w + x]
    }
  }
  return dst
}

// 出力は 1 粒 8 float: x, y, 半径, 筆の向き, r, g, b, 異方性
const prepare = (id: number, n: number) => {
  if (cacheN !== n) {
    cache.clear()
    cacheN = n
  }
  const hit = cache.get(id)
  if (hit) return hit
  const bmp = bitmaps.get(id)!
  const long = Math.round(Math.min(1024, Math.max(320, Math.sqrt(n) * 1.4)))
  const sc = long / Math.max(bmp.width, bmp.height)
  const w = Math.max(8, Math.round(bmp.width * sc))
  const h = Math.max(8, Math.round(bmp.height * sc))
  const size = w * h
  const ctx = new OffscreenCanvas(w, h).getContext('2d', {
    willReadFrequently: true,
  })!
  ctx.drawImage(bmp, 0, 0, w, h)
  const px = ctx.getImageData(0, 0, w, h).data

  const lum = new Float32Array(size)
  for (let i = 0; i < size; i++)
    lum[i] =
      (0.2126 * px[4 * i] + 0.7152 * px[4 * i + 1] + 0.0722 * px[4 * i + 2]) /
      255
  const L = (x: number, y: number) =>
    lum[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]
  let jxx = new Float32Array(size)
  let jxy = new Float32Array(size)
  let jyy = new Float32Array(size)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const gx =
        L(x + 1, y - 1) +
        2 * L(x + 1, y) +
        L(x + 1, y + 1) -
        L(x - 1, y - 1) -
        2 * L(x - 1, y) -
        L(x - 1, y + 1)
      const gy =
        L(x - 1, y + 1) +
        2 * L(x, y + 1) +
        L(x + 1, y + 1) -
        L(x - 1, y - 1) -
        2 * L(x, y - 1) -
        L(x + 1, y - 1)
      const i = y * w + x
      jxx[i] = gx * gx
      jxy[i] = gx * gy
      jyy[i] = gy * gy
    }
  const r = Math.max(2, Math.round(long / 180))
  jxx = boxBlur(boxBlur(jxx, w, h, r), w, h, r)
  jxy = boxBlur(boxBlur(jxy, w, h, r), w, h, r)
  jyy = boxBlur(boxBlur(jyy, w, h, r), w, h, r)

  const mag = new Float32Array(size)
  const ang = new Float32Array(size)
  const ani = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    const a = jxx[i]
    const b = jxy[i]
    const c = jyy[i]
    const tr = a + c
    const d = Math.sqrt((a - c) * (a - c) + 4 * b * b)
    mag[i] = Math.sqrt((tr + d) / 2)
    ani[i] = d / (tr + 1e-6)
    ang[i] = 0.5 * Math.atan2(2 * b, a - c) + Math.PI / 2 // 勾配に直交 = 輪郭に沿う向き
  }
  const p95 = mag.slice().sort()[Math.floor(size * 0.95)] || 1e-6
  const cdf = new Float64Array(size)
  let total = 0
  for (let i = 0; i < size; i++) {
    total += 0.28 + Math.min(1, mag[i] / p95) ** 0.75
    cdf[i] = total
  }

  const out = new Float32Array(n * 8)
  const aspect = w / h
  const meanW = total / size
  // 先頭の nw 粒は下塗り。ぼかした色を太い筆で均一に置き、上の細かい筆の隙間から紙が透けないようにする
  const nw = washCount(n)
  const nd = n - nw
  const s0 = Math.sqrt(aspect / nd)
  const br = Math.max(2, Math.round(long / 90))
  const channel = (c: number) => {
    const a = new Float32Array(size)
    for (let i = 0; i < size; i++) a[i] = px[4 * i + c] / 255
    return boxBlur(boxBlur(a, w, h, br), w, h, br)
  }
  const soft = [channel(0), channel(1), channel(2)]
  const cols = Math.max(1, Math.round(Math.sqrt(nw * aspect)))
  const rows = Math.ceil(nw / cols)
  const sw = Math.sqrt(aspect / nw)
  for (let k = 0; k < nw; k++) {
    const gx = ((k % cols) + Math.random()) / cols
    const gy = (((k / cols) | 0) + Math.random()) / rows
    const ix = Math.min(w - 1, (gx * w) | 0)
    const iy = Math.min(h - 1, (gy * h) | 0)
    const jj = iy * w + ix
    const o = k * 8
    out[o] = gx * aspect - aspect / 2
    out[o + 1] = gy - 0.5
    out[o + 2] = sw * 0.75
    out[o + 3] = ang[jj]
    out[o + 4] = soft[0][jj]
    out[o + 5] = soft[1][jj]
    out[o + 6] = soft[2][jj]
    out[o + 7] = ani[jj] * 0.3
  }
  let j = 0
  for (let k = nw; k < n; k++) {
    const u = ((k - nw + Math.random()) / nd) * total
    while (j < size - 1 && cdf[j] < u) j++
    const wj = cdf[j] - (j ? cdf[j - 1] : 0)
    const ix = j % w
    const iy = (j / w) | 0
    const o = k * 8
    out[o] = (ix + Math.random()) / h - aspect / 2
    out[o + 1] = (iy + Math.random()) / h - 0.5
    out[o + 2] = s0 * Math.sqrt(meanW / wj) * 0.9
    out[o + 3] = ang[j]
    out[o + 4] = px[4 * j] / 255
    out[o + 5] = px[4 * j + 1] / 255
    out[o + 6] = px[4 * j + 2] / 255
    out[o + 7] = ani[j]
  }
  const res = { data: out, aspect }
  cache.set(id, res)
  return res
}

scope.onmessage = ({ data: m }) => {
  try {
    if (m.type === 'add') {
      bitmaps.set(m.id, m.bitmap)
      return
    }
    const t0 = performance.now()
    const { data, aspect } = prepare(m.id, m.n)
    const t1 = performance.now()
    const fresh = !cur || cur.length !== data.length
    cur = fresh
      ? data.slice()
      : assign(cur!, data, m.n, m.mode, m.cw, m.keepColor)
    const copy = cur.slice()
    scope.postMessage(
      {
        type: 'assigned',
        seq: m.seq,
        id: m.id,
        data: copy,
        aspect,
        fresh,
        prepMs: t1 - t0,
        assignMs: performance.now() - t1,
      },
      [copy.buffer],
    )
  } catch (error) {
    scope.postMessage({
      type: 'error',
      message:
        error instanceof Error ? (error.stack ?? error.message) : String(error),
    })
  }
}
