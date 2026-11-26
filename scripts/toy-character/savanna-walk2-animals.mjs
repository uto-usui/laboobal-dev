import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
const out = '.work/toy-character/savanna-walk2'
const b = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
const results = []
for (const [name, width, height] of [
  ['desktop', 1440, 900],
  ['mobile', 390, 844],
]) {
  const p = await b.newPage({ viewport: { width, height } })
  await p.goto('http://localhost:4410/toy-figure/?walk-inspect')
  await p.waitForFunction(() => window.__toyWalk)
  await p.waitForTimeout(150)
  await p.evaluate(() => {
    window.__toyWalk.controls.paused = true
  })
  const result = await p.evaluate(() => {
    const a = window.__toyWalk,
      whole = [0, 0],
      rows = [],
      examples = {}
    for (let i = 0; i < 60 * 60; i++) {
      a.advance(1 / 60)
      const v = a.sceneFrame()
      for (const r of v.animalBounds)
        if (
          r.minX > -0.98 &&
          r.maxX < 0.98 &&
          r.minY > -0.98 &&
          r.maxY < 0.98
        ) {
          whole[r.species]++
          examples[r.species] ??= i
        }
      if (i % 30 === 0) rows.push({ time: i / 60, ...v })
    }
    return { whole, examples, rows, s: a.snapshot() }
  })
  results.push({ name, ...result })
  assert.equal(result.s.scenery.overlapFrames, 0)
  assert(
    result.whole.every((n) => n > 30),
    JSON.stringify(result.whole),
  )
  await p.close()
}
await fs.writeFile(
  `${out}/animal-visibility.json`,
  JSON.stringify(results, null, 2),
)
console.log(
  results.map(({ name, whole, examples }) => ({ name, whole, examples })),
)
await b.close()
