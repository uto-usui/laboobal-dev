import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const out = '.work/toy-character/savanna-walk3'
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
for (const [name, width, height, dpr] of [
  ...(process.argv.includes('--mobile-only')
    ? []
    : [['desktop', 1440, 900, 2]]),
  ['mobile', 390, 844, 3],
]) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: dpr,
  })
  page.on('pageerror', (e) => console.log('ERROR', e.message))
  await page.goto('http://localhost:4410/toy-figure/?walk-inspect')
  await page.waitForFunction(() => window.__toyWalk)
  await page.evaluate(() => {
    window.__toyWalk.controls.paused = true
    window.__toyWalk.beginMetrics()
  })
  const rows = []
  for (let i = 0; i < 4; i++) {
    if (i)
      await page.evaluate(() => {
        for (let i = 0; i < 1200; i++) window.__toyWalk.advance(1 / 60)
      })
    rows.push(
      await page.evaluate(() => ({
        snapshot: window.__toyWalk.snapshot(),
        view: window.__toyWalk.sceneFrame(),
        metrics: window.__toyWalk.metrics(),
      })),
    )
    await page.screenshot({ path: `${out}/quick-${name}-${i * 20}.png` })
  }
  await fs.writeFile(`${out}/quick-${name}.json`, JSON.stringify(rows, null, 2))
  console.log(
    name,
    rows.map(({ snapshot: s, view, metrics: m }) => ({
      distance: s.distance,
      step: s.step,
      view,
      knee: [m.kneeMin, m.kneeMax],
      thigh: m.thighMax,
      lift: m.soleHeightMaxMm,
      speed: [Math.min(...m.cameraSpeeds), Math.max(...m.cameraSpeeds)],
    })),
  )
  await page.close()
}
await browser.close()
