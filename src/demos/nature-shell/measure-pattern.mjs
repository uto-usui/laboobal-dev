import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { CELLS, createAutomaton, PATTERNS, ROWS, SEED } from './automaton.ts'

// 照明や投影の面積差を除き、殻に貼る完成時の色素画像そのものを測る。
export const measurePattern = (image) => {
  const visited = new Uint8Array(CELLS * ROWS)
  const areas = []
  let white = 0
  for (let i = 0; i < visited.length; i++) {
    if (image[i * 4] < 128) continue
    white++
    if (visited[i]) continue
    const stack = [i]
    visited[i] = 1
    let area = 0
    while (stack.length) {
      const p = stack.pop()
      area++
      const x = p % CELLS
      const y = Math.floor(p / CELLS)
      // 斜めの前線を別の三角に数えず、閉じた殻口の継ぎ目もつなぐ。
      for (let dy = -1; dy <= 1; dy++) {
        if (y + dy < 0 || y + dy >= ROWS) continue
        for (let dx = -1; dx <= 1; dx++) {
          const q = (y + dy) * CELLS + ((x + dx + CELLS) % CELLS)
          if (visited[q] || image[q * 4] < 128) continue
          visited[q] = 1
          stack.push(q)
        }
      }
    }
    areas.push(area)
  }
  areas.sort((a, b) => a - b)
  return {
    whiteCells: white,
    totalCells: CELLS * ROWS,
    whiteFraction: white / (CELLS * ROWS),
    components: areas.length,
    small: areas.filter((area) => area < 256).length,
    medium: areas.filter((area) => area >= 256 && area < 2048).length,
    large: areas.filter((area) => area >= 2048).length,
    median: areas[Math.floor(areas.length / 2)],
    p90: areas[Math.floor(areas.length * 0.9)],
    max: areas.at(-1),
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const model = createAutomaton(PATTERNS.三角, SEED)
  model.growTo(ROWS)
  console.log(JSON.stringify(measurePattern(model.history), null, 2))
  // 引数があれば、同じ二値画像をPGMとして保存する。計測時にノイズ除去はしない。
  if (process.argv[2]) {
    const pixels = Buffer.alloc(CELLS * ROWS)
    for (let i = 0; i < pixels.length; i++) pixels[i] = model.history[i * 4]
    writeFileSync(
      process.argv[2],
      Buffer.concat([Buffer.from(`P5\n${CELLS} ${ROWS}\n255\n`), pixels]),
    )
  }
}
