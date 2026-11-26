import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const out = '.work/toy-character/dino2'
const b = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
const records = []
for (const [name, w, h, dpr] of [
  ['desktop', 1440, 900, 2],
  ['embed', 800, 500, 2],
  ['mobile', 390, 844, 3],
]) {
  const p = await b.newPage({
    viewport: { width: w, height: h },
    deviceScaleFactor: dpr,
  })
  await p.routeWebSocket('**/*', () => {})
  await p.goto('http://localhost:4410/toy-figure/?walk-inspect')
  await p.waitForFunction(
    () =>
      window.__toyWalk &&
      document.querySelector('.toy-figure').getAttribute('aria-busy') ===
        'false',
  )
  const selected = await p.evaluate(() => {
    const a = window.__toyWalk
    a.controls.paused = true
    for (let i = 0; i < 1800; i++) {
      a.advance(1 / 60, false)
      const r = a
        .sceneFrame()
        .animalBounds.find(
          (r) =>
            r.species === 0 &&
            r.minX > -0.95 &&
            r.maxX < 0.95 &&
            r.minY > -1 &&
            r.maxY < 0.98,
        )
      if (r) {
        a.advance(0)
        return { frame: r, character: a.framing(), snapshot: a.snapshot() }
      }
    }
    throw Error('T-Rex never fully framed')
  })
  await p.screenshot({ path: `${out}/still-${name}.png` })
  records.push({ name, w, h, dpr, ...selected })
  if (name === 'desktop') {
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
      const y = Math.floor((1 - top.y) * 450 - 8)
      return {
        x: Math.floor((floor.x + 1) * 720 - 110),
        y,
        width: 220,
        height: Math.min(900 - y, Math.ceil((top.y - floor.y) * 450 + 42)),
      }
    })
    const legs = []
    for (let i = 0; i < 9; i++) {
      if (i) await p.evaluate(() => window.__toyWalk.advance(1 / 12))
      await p.screenshot({ path: `${out}/leg-${i}.png`, clip })
      legs.push(await p.evaluate(() => window.__toyWalk.snapshot()))
    }
    await fs.writeFile(
      `${out}/legs.json`,
      JSON.stringify({ clip, legs }, null, 2),
    )
  }
  await p.close()
}
await fs.writeFile(`${out}/stills.json`, JSON.stringify(records, null, 2))
await b.close()
