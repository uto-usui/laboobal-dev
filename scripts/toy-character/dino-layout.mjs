import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const b = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
const out = '.work/toy-character/dino'
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
    const result = await p.evaluate(() => {
      const a = window.__toyWalk
      const failures = []
      for (let i = 0; i < 1800; i++) {
        a.advance(0.1, false)
        if (a.sceneFrame().silhouetteOverlaps && failures.length < 12)
          failures.push({
            time: i / 10,
            view: a.sceneFrame(),
            scenery: a.snapshot().scenery,
          })
      }
      return failures
    })
    await fs.writeFile(
      `${out}/layout-${name}-${angle}.json`,
      JSON.stringify(result, null, 2),
    )
    console.log(
      name,
      angle,
      result.map((r) => ({
        t: r.time,
        p: r.scenery.overlappingProps,
        animals: r.view.animalBounds,
        c: r.view.characterBounds,
      })),
    )
    await p.close()
  }
await b.close()
