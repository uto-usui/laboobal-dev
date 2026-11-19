export const CELLS = 384
export const ROWS = 1536
export const SEED = 0x71c3a9
export const PATTERN_SCALE = 1
export const PATTERN_WIDTH = CELLS
export const PATTERN_HEIGHT = ROWS
// 完成後も縁へ入力できるよう、最後の帯だけを循環させる。内側の記録は残す。
export const LIVE_ROWS = 192
export const INITIAL_SEEDS = [14, 76, 136, 200, 270, 336] as const

export type PatternName = '三角' | '縞' | '網目'

export interface PatternOptions {
  spread: number
  inhibition: number
  rest: number
  spontaneous: number
}

// 同じ遷移則の伝播距離、抑制の速さ、不応期、自然発火率だけを変える。
export const PATTERNS: Record<PatternName, PatternOptions> = {
  // 白の面積を保って発火を間引き、縮小表示でも三角の面が残る間隔にする。
  三角: { spread: 1, inhibition: 2, rest: 1, spontaneous: 0.0018 },
  縞: { spread: 3, inhibition: 6, rest: 54, spontaneous: 0.0018 },
  網目: { spread: 1, inhibition: 1, rest: 22, spontaneous: 0.003 },
}

export const historyRow = (row: number) =>
  row < ROWS ? row : ROWS - LIVE_ROWS + ((row - ROWS) % LIVE_ROWS)

export const createAutomaton = (
  initialOptions: PatternOptions,
  seed = SEED,
  initial: readonly number[] = INITIAL_SEEDS,
) => {
  let options = initialOptions
  const active = new Uint8Array(CELLS)
  const refractory = new Uint16Array(CELLS)
  let left = new Uint8Array(CELLS)
  let right = new Uint8Array(CELLS)
  let nextLeft = new Uint8Array(CELLS)
  let nextRight = new Uint8Array(CELLS)
  let inhibitLeft = new Uint8Array(CELLS)
  let inhibitRight = new Uint8Array(CELLS)
  let nextInhibitLeft = new Uint8Array(CELLS)
  let nextInhibitRight = new Uint8Array(CELLS)
  const collision = new Uint8Array(CELLS)
  const history = new Uint8Array(PATTERN_WIDTH * PATTERN_HEIGHT * 4)
  let row = 0
  let automatic = true
  let randomState = seed >>> 0
  const wrap = (i: number) => (i + CELLS) % CELLS
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0
    return randomState / 4294967296
  }
  const ignite = (cell: number) => {
    const i = wrap(Math.round(cell))
    // 読む人の入力は不応期中でも受け、同じ場所を再び触っても波を起こす。
    refractory[i] = 0
    active[i] = left[i] = right[i] = 1
  }
  for (const cell of initial) ignite(cell)

  const inhibit = (i: number) => {
    active[i] = left[i] = right[i] = 0
    refractory[i] = options.rest
    inhibitLeft[i] = inhibitRight[i] = 1
  }
  const advance = () => {
    for (let i = 0; i < CELLS; i++) if (refractory[i]) refractory[i]--
    for (let step = 0; step < options.spread; step++) {
      nextLeft.fill(0)
      nextRight.fill(0)
      collision.fill(0)
      for (let i = 0; i < CELLS; i++) {
        const before = wrap(i - 1)
        const after = wrap(i + 1)
        // 同じセルへの到着と、セル間ですれ違う衝突の両方で波を消す。
        if (right[i] && left[after]) {
          collision[i] = collision[after] = 1
        }
        if (left[i]) nextLeft[before] = 1
        if (right[i]) nextRight[after] = 1
      }
      for (let i = 0; i < CELLS; i++) {
        if (collision[i] || (nextLeft[i] && nextRight[i])) {
          inhibit(i)
          nextLeft[i] = nextRight[i] = 0
        } else if (nextLeft[i] || nextRight[i]) {
          if (refractory[i]) {
            // 抑制された場所へ達した前線も消え、後方へ抑制を返す。
            inhibit(i)
            nextLeft[i] = nextRight[i] = 0
          } else active[i] = 1
        }
      }
      ;[left, nextLeft] = [nextLeft, left]
      ;[right, nextRight] = [nextRight, right]
    }
    // 衝突から戻る抑制は活性域だけを進む。幅や寿命を別の図形で決めない。
    for (let step = 0; step < options.inhibition; step++) {
      nextInhibitLeft.fill(0)
      nextInhibitRight.fill(0)
      for (let i = 0; i < CELLS; i++) {
        if (inhibitLeft[i] && active[wrap(i - 1)])
          nextInhibitLeft[wrap(i - 1)] = 1
        if (inhibitRight[i] && active[wrap(i + 1)])
          nextInhibitRight[wrap(i + 1)] = 1
      }
      for (let i = 0; i < CELLS; i++)
        if (nextInhibitLeft[i] || nextInhibitRight[i]) {
          active[i] = left[i] = right[i] = 0
          refractory[i] = options.rest
        }
      ;[inhibitLeft, nextInhibitLeft] = [nextInhibitLeft, inhibitLeft]
      ;[inhibitRight, nextInhibitRight] = [nextInhibitRight, inhibitRight]
    }
    if (automatic)
      for (let i = 0; i < CELLS; i++)
        if (!active[i] && !refractory[i] && random() < options.spontaneous)
          ignite(i)
    const offset = historyRow(row) * CELLS * 4
    for (let i = 0; i < CELLS; i++) {
      // R は活性そのもの、G は抑制の残量。輪郭線や三角形の描画はしない。
      history[offset + i * 4] = active[i] * 255
      history[offset + i * 4 + 1] = Math.min(
        255,
        Math.round((refractory[i] / options.rest) * 255),
      )
      history[offset + i * 4 + 3] = 255
    }
    row++
  }

  return {
    history,
    get row() {
      return row
    },
    get hasActivity() {
      return (
        left.some(Boolean) ||
        right.some(Boolean) ||
        inhibitLeft.some(Boolean) ||
        inhibitRight.some(Boolean)
      )
    },
    // 操作前の見本の波を残すと、どの波を起こしたか分からなくなる。
    takeControl() {
      if (!automatic) return
      automatic = false
      active.fill(0)
      refractory.fill(0)
      left.fill(0)
      right.fill(0)
      inhibitLeft.fill(0)
      inhibitRight.fill(0)
    },
    excite: ignite,
    configure(value: PatternOptions) {
      options = value
    },
    advance,
    growTo(target: number) {
      while (row < target) advance()
    },
  }
}

// 新しく描いた帯だけを各縮小段へ伝える。未生成の行は黒のまま、古い行は変更しない。
export const createMipChain = (base: Uint8Array) => {
  const levels = [{ data: base, width: PATTERN_WIDTH, height: PATTERN_HEIGHT }]
  while (levels.at(-1)!.width > 1 || levels.at(-1)!.height > 1) {
    const previous = levels.at(-1)!
    const width = Math.max(1, Math.floor(previous.width / 2))
    const height = Math.max(1, Math.floor(previous.height / 2))
    levels.push({ data: new Uint8Array(width * height * 4), width, height })
  }
  return (from: number, to: number) => {
    let start = from * PATTERN_SCALE
    let end = to * PATTERN_SCALE
    return levels.map((level, index) => {
      if (index > 0) {
        const previous = levels[index - 1]
        start = Math.floor((start * level.height) / previous.height)
        end = Math.ceil((end * level.height) / previous.height)
        for (let y = start; y < end; y++)
          for (let x = 0; x < level.width; x++) {
            const x0 = Math.floor((x * previous.width) / level.width)
            const x1 = Math.floor(((x + 1) * previous.width) / level.width)
            const y0 = Math.floor((y * previous.height) / level.height)
            const y1 = Math.floor(((y + 1) * previous.height) / level.height)
            for (let channel = 0; channel < 3; channel++) {
              let sum = 0
              for (let j = y0; j < y1; j++)
                for (let i = x0; i < x1; i++)
                  sum += previous.data[(j * previous.width + i) * 4 + channel]
              level.data[(y * level.width + x) * 4 + channel] = Math.round(
                sum / ((x1 - x0) * (y1 - y0)),
              )
            }
          }
      }
      return { ...level, start, end }
    })
  }
}
