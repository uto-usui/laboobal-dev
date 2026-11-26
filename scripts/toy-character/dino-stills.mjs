import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const out = '.work/toy-character/dino'
const b = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
const records = []
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
    await p.routeWebSocket('**/*', () => {})
    await p.goto(`http://localhost:4410/toy-figure/?walk-inspect&view=${angle}`)
    await p.waitForFunction(
      () =>
        window.__toyWalk &&
        document.querySelector('.toy-figure').getAttribute('aria-busy') ===
          'false',
    )
    await p.evaluate(() => {
      const a = window.__toyWalk
      a.controls.paused = true
      for (let i = 0; i < 540; i++) a.advance(1 / 60, false)
      a.advance(0)
    })
    await p.screenshot({ path: `${out}/still-${name}-${angle}.png` })
    records.push({
      name,
      angle,
      w,
      h,
      dpr,
      framing: await p.evaluate(() => window.__toyWalk.framing()),
      snapshot: await p.evaluate(() => window.__toyWalk.snapshot()),
    })
    if (name === 'desktop' && angle === 30) {
      const clip = await p.evaluate(async () => {
        const url = performance
          .getEntriesByType('resource')
          .map((r) => r.name)
          .find((u) => /\/three\.js\?/.test(u))
        const T = await import(url)
        const a = window.__toyWalk,
          { camera } = a.objects(),
          s = a.snapshot()
        const top = new T.Vector3(0, 0.53, s.position[2]).project(camera),
          floor = new T.Vector3(0, 0.06, s.position[2]).project(camera)
        return {
          x: Math.floor((floor.x + 1) * 720 - 110),
          y: Math.floor((1 - top.y) * 450 - 8),
          width: 220,
          height: Math.ceil((top.y - floor.y) * 450 + 42),
        }
      })
      const legs = []
      for (let i = 0; i < 9; i++) {
        if (i) await p.evaluate(() => window.__toyWalk.advance(1 / 12))
        await p.screenshot({ path: `${out}/leg-${i}.png`, clip })
        legs.push({
          time: i / 12,
          ...(await p.evaluate(() => window.__toyWalk.snapshot())),
        })
      }
      await fs.writeFile(
        `${out}/legs.json`,
        JSON.stringify({ clip, frames: legs }, null, 2),
      )
    }
    await p.close()
  }
await fs.writeFile(`${out}/stills.json`, JSON.stringify(records, null, 2))
await b.close()
