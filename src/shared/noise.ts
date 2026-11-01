/*
 * Simplex noise（2D と 3D）。値は -1〜1。
 * Stefan Gustavson のパブリックドメインのコードと、Joseph Gentle の JavaScript 版をもとに書き直した。
 * シェーダーで使うときは glsl/simplex-noise.glsl を使う
 */

const GRAD3 = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
] as const

const F2 = 0.5 * (Math.sqrt(3) - 1)
const G2 = (3 - Math.sqrt(3)) / 6
const F3 = 1 / 3
const G3 = 1 / 6

/** seed を変えると別の模様になる。同じ seed なら毎回同じ模様 */
export const createNoise = (seed = Math.random()) => {
  const perm = new Uint8Array(512)
  const permMod12 = new Uint8Array(512)

  // seed から決まる並びで 0〜255 を混ぜる（mulberry32）
  let s = Math.floor(seed * 2 ** 32) >>> 0
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
  const p = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255]
    permMod12[i] = perm[i] % 12
  }

  const noise2D = (xin: number, yin: number) => {
    const s = (xin + yin) * F2
    const i = Math.floor(xin + s)
    const j = Math.floor(yin + s)
    const t = (i + j) * G2
    const x0 = xin - (i - t)
    const y0 = yin - (j - t)
    const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1]
    const x1 = x0 - i1 + G2
    const y1 = y0 - j1 + G2
    const x2 = x0 - 1 + 2 * G2
    const y2 = y0 - 1 + 2 * G2
    const ii = i & 255
    const jj = j & 255

    const corner = (gi: number, x: number, y: number) => {
      const t = 0.5 - x * x - y * y
      if (t < 0) return 0
      const g = GRAD3[gi]
      return t ** 4 * (g[0] * x + g[1] * y)
    }
    return (
      70 *
      (corner(permMod12[ii + perm[jj]], x0, y0) +
        corner(permMod12[ii + i1 + perm[jj + j1]], x1, y1) +
        corner(permMod12[ii + 1 + perm[jj + 1]], x2, y2))
    )
  }

  const noise3D = (xin: number, yin: number, zin: number) => {
    const s = (xin + yin + zin) * F3
    const i = Math.floor(xin + s)
    const j = Math.floor(yin + s)
    const k = Math.floor(zin + s)
    const t = (i + j + k) * G3
    const x0 = xin - (i - t)
    const y0 = yin - (j - t)
    const z0 = zin - (k - t)

    let i1, j1, k1, i2, j2, k2
    if (x0 >= y0) {
      if (y0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0]
      else if (x0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1]
      else [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1]
    } else {
      if (y0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1]
      else if (x0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1]
      else [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0]
    }

    const x1 = x0 - i1 + G3
    const y1 = y0 - j1 + G3
    const z1 = z0 - k1 + G3
    const x2 = x0 - i2 + 2 * G3
    const y2 = y0 - j2 + 2 * G3
    const z2 = z0 - k2 + 2 * G3
    const x3 = x0 - 1 + 3 * G3
    const y3 = y0 - 1 + 3 * G3
    const z3 = z0 - 1 + 3 * G3
    const ii = i & 255
    const jj = j & 255
    const kk = k & 255

    const corner = (gi: number, x: number, y: number, z: number) => {
      const t = 0.6 - x * x - y * y - z * z
      if (t < 0) return 0
      const g = GRAD3[gi]
      return t ** 4 * (g[0] * x + g[1] * y + g[2] * z)
    }
    return (
      32 *
      (corner(permMod12[ii + perm[jj + perm[kk]]], x0, y0, z0) +
        corner(permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]], x1, y1, z1) +
        corner(permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]], x2, y2, z2) +
        corner(permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]], x3, y3, z3))
    )
  }

  return { noise2D, noise3D }
}
