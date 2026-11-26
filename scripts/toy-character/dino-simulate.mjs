import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const out = '.work/toy-character/dino'
const b = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
for (const [name, w, h] of [
  ['desktop', 1440, 900],
  ['mobile', 390, 844],
])
  for (const angle of [30, 50]) {
    const p = await b.newPage({ viewport: { width: w, height: h } })
    await p.routeWebSocket('**/*', () => {})
    await p.goto(`http://localhost:4410/toy-figure/?walk-inspect&view=${angle}`)
    await p.waitForFunction(
      () =>
        window.__toyWalk &&
        document.querySelector('.toy-figure').getAttribute('aria-busy') ===
          'false',
    )
    await p.evaluate(() => {
      window.__toyWalk.controls.paused = true
      window.__toyWalk.beginMetrics()
    })
    const rows = []
    for (let s = 0; s < 180; s++) {
      rows.push(
        await p.evaluate(() => {
          const a = window.__toyWalk
          for (let i = 0; i < 60; i++) a.advance(1 / 60, false)
          return { s: a.snapshot(), v: a.sceneFrame() }
        }),
      )
      if (s % 30 === 0)
        console.log(name, angle, s, rows.at(-1).s.scenery.appearances)
    }
    const metrics = await p.evaluate(() => window.__toyWalk.metrics())
    await fs.writeFile(
      `${out}/simulation-${name}-${angle}.json`,
      JSON.stringify({ rows, metrics }, null, 2),
    )
    console.log(
      name,
      angle,
      'SUMMARY',
      JSON.stringify({
        overlaps: metrics.scenery.overlapFrames,
        trees: [
          Math.min(...metrics.treeCounts),
          Math.max(...metrics.treeCounts),
        ],
        objects: [metrics.visibleObjectsMin, metrics.visibleObjectsMax],
        animals: metrics.scenery.animals,
      }),
    )
    await p.close()
  }
await b.close()
