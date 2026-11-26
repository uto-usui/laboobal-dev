import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const b = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
const p = await b.newPage({
  viewport: { width: 2600, height: 900 },
  deviceScaleFactor: 1,
})
await p.routeWebSocket('**/*', () => {})
await p.goto('http://localhost:4410/toy-figure/?walk-inspect')
await p.waitForFunction(
  () =>
    window.__toyWalk &&
    document.querySelector('.toy-figure').getAttribute('aria-busy') === 'false',
)
const a = await p.evaluate(() => window.__toyWalk.scaleLineup())
await p.screenshot({ path: '.work/toy-character/dino2/scale.png' })
const data = JSON.parse(
  await fs.readFile('.work/toy-character/dino2/assets.json', 'utf8'),
)
for (let i = 0; i < 6; i++)
  Object.assign(data.assets[i], {
    bodyLengthM: a[i].length,
    walkPoseHeightM: a[i].height,
  })
await fs.writeFile(
  '.work/toy-character/dino2/assets.json',
  JSON.stringify(data, null, 2),
)
console.log(a.map((r) => [r.species, r.length, r.height]))
await b.close()
