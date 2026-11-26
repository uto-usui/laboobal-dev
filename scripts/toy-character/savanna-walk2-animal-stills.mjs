import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const out = '.work/toy-character/savanna-walk2'
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
const records = []
for (const [name, width, height, dpr] of [
  ['desktop', 1440, 900, 2],
  ['mobile', 390, 844, 3],
]) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: dpr,
  })
  await page.goto('http://localhost:4410/toy-figure/?walk-inspect')
  await page.waitForFunction(() => window.__toyWalk)
  await page.waitForTimeout(150)
  await page.evaluate(() => {
    window.__toyWalk.controls.paused = true
  })
  for (const species of [0, 1]) {
    const record = await page.evaluate((species) => {
      const a = window.__toyWalk
      let whole = 0
      for (let i = 0; i < 6000; i++) {
        a.advance(1 / 60)
        const v = a.sceneFrame(),
          r = v.animalBounds.find((r) => r.species === species)
        const full =
          r &&
          r.minX > -0.98 &&
          r.maxX < 0.98 &&
          r.minY > -0.98 &&
          r.maxY < 0.98
        whole = full ? whole + 1 : 0
        if (whole >= 10) return { snapshot: a.snapshot(), view: v }
      }
      throw Error('No whole animal was visible')
    }, species)
    await page.screenshot({
      path: `${out}/animal-${name}-${species === 0 ? 'zebra' : 'elephant'}.png`,
    })
    records.push({ name, species, ...record })
  }
  await page.close()
}
await fs.writeFile(
  `${out}/animal-stills.json`,
  JSON.stringify(records, null, 2),
)
await browser.close()
