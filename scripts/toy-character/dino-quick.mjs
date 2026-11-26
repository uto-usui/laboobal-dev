import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const out = '.work/toy-character/dino'
const b = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
for (const [name, w, h, dpr] of [
  ['desktop', 1440, 900, 2],
  ['embed', 800, 500, 2],
  ['mobile', 390, 844, 3],
])
  for (const angle of [30, 50]) {
    const p = await b.newPage({
      viewport: { width: w, height: h },
      deviceScaleFactor: dpr,
    })
    p.on('pageerror', (e) => console.log('ERROR', e.message))
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
    for (let t = 0; t < 4; t++) {
      if (t)
        await p.evaluate(() => {
          for (let i = 0; i < 120; i++) window.__toyWalk.advance(1 / 60)
        })
      await p.screenshot({
        path: `${out}/quick-${name}-${angle}-${t * 2}.png`,
        scale: 'css',
      })
      rows.push(
        await p.evaluate(() => ({
          s: window.__toyWalk.snapshot(),
          v: window.__toyWalk.sceneFrame(),
        })),
      )
    }
    const frame = await p.evaluate(() => window.__toyWalk.framing())
    console.log(
      name,
      angle,
      'height',
      (frame.maxY - frame.minY) / 2,
      rows.map((r) => ({
        objects: r.v.visibleObjects,
        trees: r.v.visibleTrees,
        overlap: r.v.silhouetteOverlaps,
        animals: r.s.scenery.animals.filter((a) => a.active),
      })),
    )
    await fs.writeFile(
      `${out}/quick-${name}-${angle}.json`,
      JSON.stringify({ frame, rows }, null, 2),
    )
    await p.close()
  }
await b.close()
