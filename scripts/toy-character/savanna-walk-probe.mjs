import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
const page = await browser.newPage({
  viewport: {
    width: Number(process.argv[2] ?? 1440),
    height: Number(process.argv[3] ?? 900),
  },
  deviceScaleFactor: 1,
})
page.on('pageerror', (e) => console.log('ERROR', e.message))
await page.goto('http://localhost:4410/toy-figure/?walk-inspect')
await page.waitForFunction(() => window.__toyWalk)
console.log(
  await page.evaluate(() => {
    const api = window.__toyWalk
    api.controls.paused = true
    api.beginMetrics()
    const deltas = [],
      frames = [],
      views = []
    let before = api.snapshot()
    for (let i = 0; i < 3600; i++) {
      api.advance(1 / 60)
      const s = api.snapshot()
      deltas.push({
        i,
        dz: s.distance - before.distance,
        dx: s.position[0] - before.position[0],
        step: s.stepCount !== before.stepCount,
        phase: s.phase,
        support: s.support,
        thighs: s.feet.map((f) => f.thigh),
        position: s.position,
      })
      if (i % 120 === 0) {
        frames.push(s)
        views.push(api.sceneFrame())
      }
      before = s
    }
    window.probe = {
      metrics: api.metrics(),
      deltas,
      frames,
      views,
      framing: api.framing(),
    }
    const a = deltas.map((x) => x.dz).toSorted((a, b) => a - b)
    return {
      minDelta: a[0],
      maxDelta: a.at(-1),
      medianDelta: a[Math.floor(a.length / 2)],
      last: before,
      views,
      framing: api.framing(),
    }
  }),
)
await page.screenshot({
  path: `.work/toy-character/savanna-walk/probe-${process.argv[2] ?? 1440}.png`,
})
await fs.writeFile(
  `.work/toy-character/savanna-walk/probe-${process.argv[2] ?? 1440}.json`,
  JSON.stringify(await page.evaluate(() => window.probe), null, 2),
)
await browser.close()
