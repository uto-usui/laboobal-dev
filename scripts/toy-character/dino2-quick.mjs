import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const out = '.work/toy-character/dino2'
const b = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
for (const [name, w, h, dpr] of [
  ['desktop', 1440, 900, 2],
  ['mobile', 390, 844, 3],
]) {
  const p = await b.newPage({
    viewport: { width: w, height: h },
    deviceScaleFactor: dpr,
  })
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  await p.routeWebSocket('**/*', () => {})
  await p.goto('http://localhost:4410/toy-figure/?walk-inspect')
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
  for (let s = 0; s < 135; s++) {
    const r = await p.evaluate(() => {
      const a = window.__toyWalk
      for (let j = 0; j < 60; j++) a.advance(1 / 60, false)
      a.advance(0)
      return { v: a.sceneFrame(), s: a.snapshot() }
    })
    rows.push(r)
    if ([7, 12, 24, 39, 54, 69, 84].includes(s))
      await p.screenshot({ path: `${out}/quick-${name}-${s}.png` })
  }
  await fs.writeFile(
    `${out}/quick-${name}.json`,
    JSON.stringify(
      {
        rows,
        errors,
        metrics: await p.evaluate(() => window.__toyWalk.metrics()),
      },
      null,
      2,
    ),
  )
  console.log(
    name,
    errors,
    rows
      .filter((r) => r.v.silhouetteOverlaps)
      .map((r, i) => [i, r.s.scenery.overlappingProps, r.v.animalBounds])
      .slice(0, 8),
  )
  await p.close()
}
await b.close()
