import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const out = '.work/toy-character/savanna-walk3'
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
const records = []
for (const [name, width, height] of [
  ['desktop', 1440, 900],
  ['mobile', 390, 844],
]) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.goto('http://localhost:4410/toy-figure/?walk-inspect')
  await page.waitForFunction(
    () =>
      window.__toyWalk &&
      document.querySelector('.toy-figure').getAttribute('aria-busy') ===
        'false',
  )
  await page.waitForTimeout(200)
  const result = await page.evaluate(() => {
    const api = window.__toyWalk
    api.controls.paused = true
    api.beginMetrics()
    const failures = []
    const bounds = []
    for (let i = 0; i < 10800; i++) {
      api.advance(1 / 60)
      const v = api.sceneFrame()
      const narrow = innerWidth < 800
      if (
        v.visibleTrees < (narrow ? 1 : 2) ||
        v.visibleTrees > (narrow ? 2 : 4) ||
        v.mediumTrees < 1 ||
        v.treeOverlaps
      )
        if (failures.length < 20) failures.push({ frame: i, view: v })
      if (i % 120 === 0) bounds.push({ frame: i, trees: v.treeBounds })
    }
    return {
      metrics: api.metrics(),
      snapshot: api.snapshot(),
      failures,
      bounds,
    }
  })
  await fs.writeFile(
    `${out}/simulated-${name}.json`,
    JSON.stringify(result, null, 2),
  )
  const m = result.metrics
  const a = m.treeCounts.toSorted((a, b) => a - b)
  const g = m.foregroundGrassWidths.toSorted((a, b) => a - b)
  console.log(name, {
    trees: [a[0], a[Math.floor(a.length / 2)], a.at(-1)],
    medium: m.mediumTreeFrames / m.frames,
    overlaps: m.scenery.overlapFrames,
    grass: [g[0], g[Math.floor(g.length / 2)], g.at(-1)],
    failures: result.failures.slice(0, 2),
  })
  records.push({ name, failures: result.failures.length })
  await page.screenshot({ path: `${out}/simulated-${name}.png` })
  await page.close()
}
await browser.close()
if (records.some((r) => r.failures)) process.exitCode = 1
