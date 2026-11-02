// 前の写真の粒を、次の写真のどの粒へ運ぶかを決める。Worker の中で動く。
// 粒は 1 粒 8 float（x, y, 半径, 筆の向き, r, g, b, 異方性）で並べる

export type Mode = 'transport' | 'spatial' | 'scatter'

const lin = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4

export const oklab = (
  r: number,
  g: number,
  b: number,
  out: Float32Array,
  o: number,
) => {
  r = lin(r)
  g = lin(g)
  b = lin(b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  out[o] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  out[o + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  out[o + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
}

/** 先頭のこの数の粒は下塗り（太い筆） */
export const washCount = (n: number) => n >> 4

// 32bit キーの LSD 基数ソート。並べ替えた添字を out に書く
let rsK = new Uint32Array(0)
let rsK2 = rsK
let rsI = rsK
let rsI2 = rsK
const cnt = new Uint32Array(256)
const argsortU32 = (keys: Uint32Array, out: Uint32Array) => {
  const n = keys.length
  if (rsK.length !== n) {
    rsK = new Uint32Array(n)
    rsK2 = new Uint32Array(n)
    rsI = new Uint32Array(n)
    rsI2 = new Uint32Array(n)
  }
  let k = rsK
  let k2 = rsK2
  let ix = rsI
  let ix2 = rsI2
  k.set(keys)
  for (let i = 0; i < n; i++) ix[i] = i
  for (let sh = 0; sh < 32; sh += 8) {
    cnt.fill(0)
    for (let i = 0; i < n; i++) cnt[(k[i] >>> sh) & 255]++
    for (let b = 0, s = 0; b < 256; b++) {
      const c = cnt[b]
      cnt[b] = s
      s += c
    }
    for (let i = 0; i < n; i++) {
      const key = k[i]
      const p = cnt[(key >>> sh) & 255]++
      k2[p] = key
      ix2[p] = ix[i]
    }
    ;[k, k2] = [k2, k]
    ;[ix, ix2] = [ix2, ix]
  }
  out.set(ix)
}
const argsortF32 = (
  vals: Float32Array,
  keyBuf: Uint32Array,
  out: Uint32Array,
) => {
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i]
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  const s = 4294967295 / (hi - lo || 1)
  for (let i = 0; i < vals.length; i++) keyBuf[i] = (vals[i] - lo) * s
  argsortU32(keyBuf, out)
}

const hilbert = (x: number, y: number) => {
  let d = 0
  for (let s = 32768; s > 0; s >>= 1) {
    const rx = x & s ? 1 : 0
    const ry = y & s ? 1 : 0
    d += s * s * ((3 * rx) ^ ry)
    if (!ry) {
      if (rx) {
        x = 65535 - x
        y = 65535 - y
      }
      const t = x
      x = y
      y = t
    }
  }
  return d
}

// a の i 番目と b の i 番目を、Hilbert 曲線上の順位で 1 対 1 に結ぶ
const curveMatch = (
  ax: Float32Array,
  astride: number,
  b: Float32Array,
  n: number,
) => {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < n; i++) {
    const x = b[i * 8]
    const y = b[i * 8 + 1]
    x0 = Math.min(x0, x)
    x1 = Math.max(x1, x)
    y0 = Math.min(y0, y)
    y1 = Math.max(y1, y)
  }
  const sc = 65535 / Math.max(x1 - x0, y1 - y0, 1e-6)
  const q = (v: number) => Math.max(0, Math.min(65535, Math.round(v)))
  const ka = new Uint32Array(n)
  const kb = new Uint32Array(n)
  const ia = new Uint32Array(n)
  const ib = new Uint32Array(n)
  for (let i = 0; i < n; i++) {
    ka[i] = hilbert(
      q((ax[i * astride] - x0) * sc),
      q((ax[i * astride + 1] - y0) * sc),
    )
    kb[i] = hilbert(q((b[i * 8] - x0) * sc), q((b[i * 8 + 1] - y0) * sc))
  }
  argsortU32(ka, ia)
  argsortU32(kb, ib)
  const perm = new Uint32Array(n)
  for (let r = 0; r < n; r++) perm[ia[r]] = ib[r]
  return perm
}

const randomBasis = (dim: number) => {
  const basis: number[][] = []
  while (basis.length < dim) {
    let v = Array.from({ length: dim }, () => {
      const u = 1 - Math.random()
      const t = Math.random()
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * t)
    })
    for (const b of basis) {
      const d = v.reduce((s, x, i) => s + x * b[i], 0)
      v = v.map((x, i) => x - d * b[i])
    }
    const len = Math.hypot(...v)
    if (len > 1e-3) basis.push(v.map((x) => x / len))
  }
  return basis
}

// 位置 + 色の 5 次元で src の点群を dst の分布へ寄せる（反復分布変換）。戻り値は運んだ後の src の特徴量
const slicedOT = (
  src: Float32Array,
  dst: Float32Array,
  n: number,
  cw: number,
  iters: number,
) => {
  const D = 5
  const X = new Float32Array(n * D)
  const Y = new Float32Array(n * D)
  const lab = new Float32Array(3)
  const feat = (arr: Float32Array, F: Float32Array) => {
    for (let i = 0; i < n; i++) {
      const o = i * 8
      const f = i * D
      oklab(arr[o + 4], arr[o + 5], arr[o + 6], lab, 0)
      F[f] = arr[o]
      F[f + 1] = arr[o + 1]
      F[f + 2] = lab[0] * cw
      F[f + 3] = lab[1] * cw * 2.2
      F[f + 4] = lab[2] * cw * 2.2
    }
  }
  feat(src, X)
  feat(dst, Y)
  const px = new Float32Array(n)
  const py = new Float32Array(n)
  const kb = new Uint32Array(n)
  const ix = new Uint32Array(n)
  const iy = new Uint32Array(n)
  for (let it = 0; it < iters; it++) {
    for (const d of randomBasis(D)) {
      for (let i = 0; i < n; i++) {
        const f = i * D
        px[i] =
          X[f] * d[0] +
          X[f + 1] * d[1] +
          X[f + 2] * d[2] +
          X[f + 3] * d[3] +
          X[f + 4] * d[4]
        py[i] =
          Y[f] * d[0] +
          Y[f + 1] * d[1] +
          Y[f + 2] * d[2] +
          Y[f + 3] * d[3] +
          Y[f + 4] * d[4]
      }
      argsortF32(px, kb, ix)
      argsortF32(py, kb, iy)
      for (let r = 0; r < n; r++) {
        const si = ix[r]
        const delta = py[iy[r]] - px[si]
        const f = si * D
        X[f] += delta * d[0]
        X[f + 1] += delta * d[1]
        X[f + 2] += delta * d[2]
        X[f + 3] += delta * d[3]
        X[f + 4] += delta * d[4]
      }
    }
  }
  return X
}

// 位置だけの 2 次元で F の点を dst の配置へ寄せる。粒の密度が揃っていないまま近い順に結ぶと、
// ずれが一か所に溜まって遠くまで飛ぶ粒が出るので、その前に密度を揃える
const refinePos = (
  F: Float32Array,
  stride: number,
  dst: Float32Array,
  n: number,
  iters: number,
) => {
  const px = new Float32Array(n)
  const py = new Float32Array(n)
  const kb = new Uint32Array(n)
  const ix = new Uint32Array(n)
  const iy = new Uint32Array(n)
  for (let it = 0; it < iters; it++) {
    const a = Math.random() * Math.PI
    for (const [c, s] of [
      [Math.cos(a), Math.sin(a)],
      [-Math.sin(a), Math.cos(a)],
    ]) {
      for (let i = 0; i < n; i++) {
        px[i] = F[i * stride] * c + F[i * stride + 1] * s
        py[i] = dst[i * 8] * c + dst[i * 8 + 1] * s
      }
      argsortF32(px, kb, ix)
      argsortF32(py, kb, iy)
      for (let r = 0; r < n; r++) {
        const f = ix[r] * stride
        const d = py[iy[r]] - px[ix[r]]
        F[f] += d * c
        F[f + 1] += d * s
      }
    }
  }
  return F
}

// F の各点を、まだ誰も選んでいない一番近い dst へ結ぶ。順番はランダムにして、ずれが一か所に溜まらないようにする
const nearMatch = (
  F: Float32Array,
  stride: number,
  dst: Float32Array,
  n: number,
  depth = 0,
): Uint32Array => {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < n; i++) {
    const x = dst[i * 8]
    const y = dst[i * 8 + 1]
    x0 = Math.min(x0, x)
    x1 = Math.max(x1, x)
    y0 = Math.min(y0, y)
    y1 = Math.max(y1, y)
  }
  const cs = Math.sqrt(Math.max((x1 - x0) * (y1 - y0), 1e-6) / n) * 1.5
  const GW = Math.max(1, Math.ceil((x1 - x0) / cs))
  const GH = Math.max(1, Math.ceil((y1 - y0) / cs))
  const cell = (x: number, y: number) =>
    Math.min(GH - 1, Math.max(0, ((y - y0) / cs) | 0)) * GW +
    Math.min(GW - 1, Math.max(0, ((x - x0) / cs) | 0))
  const start = new Uint32Array(GW * GH + 1)
  const live = new Uint32Array(GW * GH)
  const items = new Uint32Array(n)
  const cj = new Uint32Array(n)
  for (let j = 0; j < n; j++) {
    cj[j] = cell(dst[j * 8], dst[j * 8 + 1])
    start[cj[j] + 1]++
  }
  for (let c = 0; c < GW * GH; c++) start[c + 1] += start[c]
  for (let j = 0; j < n; j++) items[start[cj[j]] + live[cj[j]]++] = j
  const order = new Uint32Array(n)
  for (let i = 0; i < n; i++) order[i] = i
  for (let i = n - 1; i > 0; i--) {
    const k = (Math.random() * (i + 1)) | 0
    const t = order[i]
    order[i] = order[k]
    order[k] = t
  }
  const perm = new Uint32Array(n)
  const rest: number[] = []
  for (const i of order) {
    const x = F[i * stride]
    const y = F[i * stride + 1]
    const gx = Math.min(GW - 1, Math.max(0, ((x - x0) / cs) | 0))
    const gy = Math.min(GH - 1, Math.max(0, ((y - y0) / cs) | 0))
    let best = -1
    let bc = 0
    let bk = 0
    let bd = Infinity
    // 升目を内側から輪にして広げ、見つかった距離より外の輪は見ない
    for (
      let r = 0;
      r <= 12 && (best < 0 || (r - 1) * cs < Math.sqrt(bd));
      r++
    ) {
      for (let cy = Math.max(0, gy - r); cy <= Math.min(GH - 1, gy + r); cy++) {
        const edge = cy === gy - r || cy === gy + r
        for (let cx = gx - r; cx <= gx + r; cx += edge ? 1 : 2 * r || 1) {
          if (cx < 0 || cx >= GW) continue
          const c = cy * GW + cx
          for (let k = 0; k < live[c]; k++) {
            const j = items[start[c] + k]
            const dx = dst[j * 8] - x
            const dy = dst[j * 8 + 1] - y
            const d = dx * dx + dy * dy
            if (d < bd) {
              bd = d
              best = j
              bc = c
              bk = k
            }
          }
        }
      }
    }
    if (best < 0) {
      rest.push(i)
      continue
    }
    perm[i] = best
    items[start[bc] + bk] = items[start[bc] + --live[bc]]
  }
  // 近くが埋まっていた残りは、残った行き先だけで同じことを繰り返す（残りは疎らなので、升目を粗くして遠くまで探せる）
  if (rest.length) {
    const left: number[] = []
    for (let c = 0; c < GW * GH; c++)
      for (let k = 0; k < live[c]; k++) left.push(items[start[c] + k])
    const a = new Float32Array(rest.length * 2)
    const b = new Float32Array(left.length * 8)
    rest.forEach((i, k) => {
      a[k * 2] = F[i * stride]
      a[k * 2 + 1] = F[i * stride + 1]
    })
    left.forEach((j, k) => {
      b[k * 8] = dst[j * 8]
      b[k * 8 + 1] = dst[j * 8 + 1]
    })
    const sub =
      depth < 6
        ? nearMatch(a, 2, b, rest.length, depth + 1)
        : curveMatch(a, 2, b, rest.length)
    rest.forEach((i, k) => {
      perm[i] = left[sub[k]]
    })
  }
  return perm
}

// 色を保つときは明るさの順位どうしを結ぶ（1 次元の最適輸送は並べ替えで厳密に解ける）。
// 同じ明るさの中では Hilbert 順に並べ、近い場所の粒が近い場所へ行くようにする
const lightnessMatch = (src: Float32Array, dst: Float32Array, n: number) => {
  const lab = new Float32Array(3)
  const keys = (arr: Float32Array) => {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (let i = 0; i < n; i++) {
      x0 = Math.min(x0, arr[i * 8])
      x1 = Math.max(x1, arr[i * 8])
      y0 = Math.min(y0, arr[i * 8 + 1])
      y1 = Math.max(y1, arr[i * 8 + 1])
    }
    const sc = 65535 / Math.max(x1 - x0, y1 - y0, 1e-6)
    const k = new Uint32Array(n)
    for (let i = 0; i < n; i++) {
      oklab(arr[i * 8 + 4], arr[i * 8 + 5], arr[i * 8 + 6], lab, 0)
      const h = hilbert(
        Math.min(65535, ((arr[i * 8] - x0) * sc) | 0),
        Math.min(65535, ((arr[i * 8 + 1] - y0) * sc) | 0),
      )
      k[i] =
        ((Math.min(4095, Math.max(0, lab[0] * 4095)) << 20) | (h >>> 12)) >>> 0
    }
    return k
  }
  const ia = new Uint32Array(n)
  const ib = new Uint32Array(n)
  const perm = new Uint32Array(n)
  argsortU32(keys(src), ia)
  argsortU32(keys(dst), ib)
  for (let r = 0; r < n; r++) perm[ia[r]] = ib[r]
  return perm
}

const assignGroup = (
  src: Float32Array,
  dst: Float32Array,
  n: number,
  mode: Mode,
  cw: number,
  keepColor: boolean,
) => {
  let perm: Uint32Array
  if (mode === 'scatter') {
    perm = new Uint32Array(n)
    for (let i = 0; i < n; i++) perm[i] = i
    for (let i = n - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0
      const t = perm[i]
      perm[i] = perm[j]
      perm[j] = t
    }
  } else if (mode === 'spatial') {
    perm = nearMatch(refinePos(src.slice(), 8, dst, n, 6), 8, dst, n)
  } else if (keepColor) {
    perm = lightnessMatch(src, dst, n)
  } else {
    const iters = n <= 131072 ? 12 : n <= 262144 ? 8 : n <= 524288 ? 5 : 3
    perm = nearMatch(
      refinePos(slicedOT(src, dst, n, cw, iters), 5, dst, n, 2),
      5,
      dst,
      n,
    )
  }
  const out = new Float32Array(n * 8)
  for (let i = 0; i < n; i++) {
    const o = i * 8
    const j = perm[i] * 8
    for (let k = 0; k < 8; k++) out[o + k] = dst[j + k]
    if (keepColor) {
      out[o + 4] = src[o + 4]
      out[o + 5] = src[o + 5]
      out[o + 6] = src[o + 6]
    }
  }
  return out
}

/** 下塗りと上塗りは別々に割り当てる。添字の並びが描く順なので、下塗りを常に先に描ける */
export const assign = (
  src: Float32Array,
  dst: Float32Array,
  n: number,
  mode: Mode,
  cw: number,
  keepColor: boolean,
) => {
  const nw = washCount(n)
  const out = new Float32Array(n * 8)
  out.set(
    assignGroup(
      src.subarray(0, nw * 8),
      dst.subarray(0, nw * 8),
      nw,
      mode,
      cw,
      keepColor,
    ),
    0,
  )
  out.set(
    assignGroup(
      src.subarray(nw * 8),
      dst.subarray(nw * 8),
      n - nw,
      mode,
      cw,
      keepColor,
    ),
    nw * 8,
  )
  return out
}
