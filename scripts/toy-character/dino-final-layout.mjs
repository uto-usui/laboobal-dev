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
    })
    const rows = []
    for (let s = 0; s < 18; s++)
      rows.push(
        ...(await p.evaluate(() => {
          const a = window.__toyWalk,
            rows = []
          for (let i = 0; i < 100; i++) {
            a.advance(0.1, false)
            const v = a.sceneFrame()
            rows.push({ view: v, scenery: a.snapshot().scenery })
          }
          return rows
        })),
      )
    await fs.writeFile(
      `${out}/layout-final-${name}-${angle}.json`,
      JSON.stringify(rows, null, 2),
    )
    console.log(name, angle, {
      overlaps: rows.filter((r) => r.view.silhouetteOverlaps).length,
      objects: [
        Math.min(...rows.map((r) => r.view.visibleObjects)),
        Math.max(...rows.map((r) => r.view.visibleObjects)),
      ],
      trees: Math.min(...rows.map((r) => r.view.visibleTrees)),
      appearances: rows.at(-1).scenery.visibleAppearanceLog,
    })
    await p.close()
  }
await b.close()
