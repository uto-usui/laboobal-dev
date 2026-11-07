/**
 * 短冊 1 枚の紙。Verlet 積分の格子で、上の行は綴じ目（anchor）につながっている。
 * 位置は canvas の px（x, y）と、手前への浮き（z）
 */
export interface Sheet {
  cols: number
  rows: number
  count: number
  /** 要素の大きさ（px）と、格子の最初の行の y（要素の中の px）。ちぎれ線より少し上から始める */
  w: number
  h: number
  top: number
  pos: Float32Array
  prev: Float32Array
  /** 束に貼られているときの位置（canvas の px） */
  rest: Float32Array
  uv: Float32Array
  normal: Float32Array
  /** 熱。0.3 で焦げ、0.5 で火がつき、1 で燃えつきる */
  heat: Float32Array
  /** 燃え広がる速さのむら */
  jitter: Float32Array
  gone: Uint8Array
  cons: Int32Array
  base: Float32Array
  len: Float32Array
  /** 上の行の列ごとに、まだ綴じ目につながっているか */
  anchored: Uint8Array
  index: Uint16Array
}

export const createSheet = (
  w: number,
  h: number,
  top: number,
  x0: number,
  y0: number,
  cols = 8,
  rows = 36,
): Sheet => {
  const count = (cols + 1) * (rows + 1)
  const pos = new Float32Array(count * 3)
  const rest = new Float32Array(count * 2)
  const uv = new Float32Array(count * 2)
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const n = j * (cols + 1) + i
      const lx = (i / cols) * w
      const ly = top + (j / rows) * (h - top)
      pos[n * 3] = rest[n * 2] = x0 + lx
      pos[n * 3 + 1] = rest[n * 2 + 1] = y0 + ly
      uv[n * 2] = lx / w
      uv[n * 2 + 1] = ly / h
    }
  }
  const pairs: number[] = []
  const at = (i: number, j: number) => j * (cols + 1) + i
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      if (i < cols) pairs.push(at(i, j), at(i + 1, j))
      if (j < rows) pairs.push(at(i, j), at(i, j + 1))
      if (i < cols && j < rows) pairs.push(at(i, j), at(i + 1, j + 1))
      if (i > 0 && j < rows) pairs.push(at(i, j), at(i - 1, j + 1))
      // 1 つ飛ばしのつなぎが、紙の曲がりにくさ
      if (i + 2 <= cols) pairs.push(at(i, j), at(i + 2, j))
      if (j + 2 <= rows) pairs.push(at(i, j), at(i, j + 2))
    }
  }
  const cons = Int32Array.from(pairs)
  const base = new Float32Array(cons.length / 2)
  for (let k = 0; k < base.length; k++) {
    const a = cons[k * 2]
    const b = cons[k * 2 + 1]
    base[k] = Math.hypot(
      pos[a * 3] - pos[b * 3],
      pos[a * 3 + 1] - pos[b * 3 + 1],
    )
  }
  const index: number[] = []
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      index.push(at(i, j), at(i, j + 1), at(i + 1, j))
      index.push(at(i + 1, j), at(i, j + 1), at(i + 1, j + 1))
    }
  }
  const jitter = new Float32Array(count)
  for (let n = 0; n < count; n++) jitter[n] = 0.6 + Math.random() * 0.8
  return {
    cols,
    rows,
    count,
    w,
    h,
    top,
    pos,
    prev: pos.slice(),
    rest,
    uv,
    normal: new Float32Array(count * 3),
    heat: new Float32Array(count),
    jitter,
    gone: new Uint8Array(count),
    cons,
    base,
    len: base.slice(),
    anchored: new Uint8Array(cols + 1).fill(1),
    index: Uint16Array.from(index),
  }
}

export interface StepOptions {
  gravity: number
  /** 束に貼られている所へ戻す強さ（1 ステップあたりの割合）。外れた紙は 0 */
  restore: number
  /** 綴じ目へ引き戻す強さ */
  anchorK: number
  /** その x での床の高さ */
  floor: (x: number) => number
  /** 左右の壁（canvas の px）。投げても画面の外へ出ない */
  left: number
  right: number
  grab?: { index: number; x: number; y: number }
  /** 燃えて炭になった所の反り（z の向き） */
  curl: number
}

/** 1 ステップ進める。戻り値は、綴じ目がいちばん伸びている長さ（px） */
export const stepSheet = (s: Sheet, dt: number, o: StepOptions) => {
  const { pos, prev, rest, heat } = s
  const g = o.gravity * dt * dt
  for (let n = 0; n < s.count; n++) {
    const p = n * 3
    // 燃えつきた点は、その場で止める。動かすと、残った紙とのあいだに細長い三角ができる
    if (s.gone[n]) continue
    const vx = (pos[p] - prev[p]) * 0.985
    const vy = (pos[p + 1] - prev[p + 1]) * 0.985
    const vz = (pos[p + 2] - prev[p + 2]) * 0.96
    prev[p] = pos[p]
    prev[p + 1] = pos[p + 1]
    prev[p + 2] = pos[p + 2]
    // 炭になった所は軽く、熱で少し浮き、手前か奥へ反る
    const char = Math.max(0, heat[n] - 0.6)
    pos[p] += vx
    pos[p + 1] += vy + g * (1 - char * 1.6)
    pos[p + 2] += vz + o.curl * char * 120 * dt * dt
    if (o.restore > 0) {
      pos[p] += (rest[n * 2] - pos[p]) * o.restore
      pos[p + 1] += (rest[n * 2 + 1] - pos[p + 1]) * o.restore
      pos[p + 2] *= 1 - o.restore
    }
    pos[p + 2] = Math.max(-36, Math.min(36, pos[p + 2] * 0.995))
  }

  const { cons, len, gone } = s
  for (let it = 0; it < 10; it++) {
    for (let k = 0; k < len.length; k++) {
      const a = cons[k * 2]
      const b = cons[k * 2 + 1]
      if (gone[a] || gone[b]) continue
      const pa = a * 3
      const pb = b * 3
      const dx = pos[pb] - pos[pa]
      const dy = pos[pb + 1] - pos[pa + 1]
      const dz = pos[pb + 2] - pos[pa + 2]
      const d = Math.hypot(dx, dy, dz) || 1e-6
      const f = ((d - len[k]) / d) * 0.5
      pos[pa] += dx * f
      pos[pa + 1] += dy * f
      pos[pa + 2] += dz * f
      pos[pb] -= dx * f
      pos[pb + 1] -= dy * f
      pos[pb + 2] -= dz * f
    }
    for (let i = 0; i <= s.cols; i++) {
      if (!s.anchored[i]) continue
      pos[i * 3] += (rest[i * 2] - pos[i * 3]) * o.anchorK
      pos[i * 3 + 1] += (rest[i * 2 + 1] - pos[i * 3 + 1]) * o.anchorK
      pos[i * 3 + 2] *= 1 - o.anchorK
    }
    if (o.grab) {
      const p = o.grab.index * 3
      pos[p] = o.grab.x
      pos[p + 1] = o.grab.y
    }
  }

  for (let n = 0; n < s.count; n++) {
    const p = n * 3
    if (pos[p] < o.left || pos[p] > o.right) {
      pos[p] = Math.max(o.left, Math.min(o.right, pos[p]))
      prev[p] = pos[p]
    }
    const floor = o.floor(pos[p])
    if (pos[p + 1] > floor) {
      pos[p + 1] = floor
      prev[p + 1] = floor
      // 床の上では擦れて止まる
      prev[p] += (pos[p] - prev[p]) * 0.4
    }
  }

  let stretch = 0
  for (let i = 0; i <= s.cols; i++) {
    if (!s.anchored[i]) continue
    stretch = Math.max(
      stretch,
      Math.hypot(pos[i * 3] - rest[i * 2], pos[i * 3 + 1] - rest[i * 2 + 1]),
    )
  }
  return stretch
}

export interface Fire {
  x: number
  y: number
  /** 炎の幅と高さ（px） */
  w: number
  h: number
}

/**
 * 熱を進める。炎の中の所は火がつき、炎の上の近くは焦げるだけ。火のついた所は燃えつきへ向かい、
 * 隣へ燃え広がる（上へは速く）。燃えつきた点の番号を返す
 */
export const burnSheet = (s: Sheet, dt: number, fire: Fire, speed: number) => {
  const { pos, heat, gone, jitter } = s
  const ended: number[] = []
  for (let n = 0; n < s.count; n++) {
    if (gone[n]) continue
    const x = pos[n * 3]
    const y = pos[n * 3 + 1]
    const dx = Math.abs(x - fire.x) / (fire.w / 2)
    const above = fire.y - y
    if (dx < 1 && above > -16) {
      const inside = above < fire.h * (1 - dx * 0.6)
      // 炎の根もとほど熱い。先の方は焦がすだけで、火は根もとから付いて上へ燃え広がる
      if (inside)
        heat[n] +=
          dt * 0.8 * speed * jitter[n] * (0.3 + 0.7 * (1 - above / fire.h) ** 2)
      else {
        // 炎の上では、触れる前から下の端が焦げる
        const near = 1 - (above - fire.h * (1 - dx * 0.6)) / 70
        if (near > 0)
          heat[n] = Math.max(heat[n], Math.min(0.34, heat[n] + dt * 0.5 * near))
      }
    }
  }
  const stride = s.cols + 1
  for (let n = 0; n < s.count; n++) {
    if (gone[n] || heat[n] < 0.5) continue
    // 炭になってからは早く崩れる。黒いままの紙を長く残さない
    heat[n] += dt * (heat[n] > 0.62 ? 0.42 : 0.17) * speed * jitter[n]
    const i = n % stride
    const j = (n - i) / stride
    const spread = dt * 1.8 * speed * jitter[n]
    // 上の行（j - 1）へは速く、横と下へは遅く
    const near = [
      [i, j - 1, 1.5],
      [i - 1, j, 0.7],
      [i + 1, j, 0.7],
      [i, j + 1, 0.6],
    ]
    for (const [a, b, k] of near) {
      if (a < 0 || a > s.cols || b < 0 || b > s.rows) continue
      const m = b * stride + a
      if (heat[m] < 0.55) heat[m] += spread * k
    }
    if (heat[n] >= 1) {
      gone[n] = 1
      ended.push(n)
    }
  }
  // 炭になった所は縮んで、紙が反る
  for (let k = 0; k < s.len.length; k++) {
    const a = s.cons[k * 2]
    const b = s.cons[k * 2 + 1]
    const c = Math.min(heat[a], heat[b])
    s.len[k] = s.base[k] * (c > 0.62 ? 0.9 : 1)
  }
  return ended
}

export const updateNormals = (s: Sheet) => {
  const { pos, normal } = s
  const stride = s.cols + 1
  for (let j = 0; j <= s.rows; j++) {
    for (let i = 0; i <= s.cols; i++) {
      const n = j * stride + i
      const l = j * stride + Math.max(0, i - 1)
      const r = j * stride + Math.min(s.cols, i + 1)
      const u = Math.max(0, j - 1) * stride + i
      const d = Math.min(s.rows, j + 1) * stride + i
      const ax = pos[r * 3] - pos[l * 3]
      const ay = pos[r * 3 + 1] - pos[l * 3 + 1]
      const az = pos[r * 3 + 2] - pos[l * 3 + 2]
      const bx = pos[d * 3] - pos[u * 3]
      const by = pos[d * 3 + 1] - pos[u * 3 + 1]
      const bz = pos[d * 3 + 2] - pos[u * 3 + 2]
      // 画面の手前（z が大きい）を表にする
      let nx = ay * bz - az * by
      let ny = az * bx - ax * bz
      let nz = ax * by - ay * bx
      const len = Math.hypot(nx, ny, nz) || 1
      nx /= len
      ny /= len
      nz /= len
      normal[n * 3] = nx
      normal[n * 3 + 1] = ny
      normal[n * 3 + 2] = nz
    }
  }
}

/** 点 (x, y) にいちばん近い、まだ燃えていない格子の点。遠ければ -1 */
export const nearest = (s: Sheet, x: number, y: number, max: number) => {
  let best = -1
  let bestD = max
  for (let n = 0; n < s.count; n++) {
    if (s.gone[n]) continue
    const d = Math.hypot(s.pos[n * 3] - x, s.pos[n * 3 + 1] - y)
    if (d < bestD) {
      bestD = d
      best = n
    }
  }
  return best
}
