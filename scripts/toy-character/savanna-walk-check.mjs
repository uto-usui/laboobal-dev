import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const out = '.work/toy-character/savanna-walk'
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
page.on('console', (m) => {
  if (m.type() === 'error') console.log('ERROR', m.text())
})
await page.goto('http://localhost:4410/toy-figure/?walk-inspect')
await page.waitForFunction(() => window.__toyWalk, { timeout: 30000 })
await page.waitForTimeout(1500)
await page.evaluate(() => window.__toyWalk.beginMetrics())
await page.screenshot({ path: `${out}/first.png` })
console.log('first', await page.evaluate(() => window.__toyWalk.snapshot()))
await page.waitForTimeout(15000)
await page.screenshot({ path: `${out}/later.png` })
console.log('later', await page.evaluate(() => window.__toyWalk.snapshot()))
await page.mouse.click(1100, 450)
await page.waitForTimeout(800)
await page.screenshot({ path: `${out}/look.png` })
console.log('look', await page.evaluate(() => window.__toyWalk.snapshot()))
await page.waitForTimeout(3000)
await fs.writeFile(
  `${out}/quick.json`,
  JSON.stringify(
    await page.evaluate(() => ({
      sample: window.__toyWalk.snapshot(),
      metrics: window.__toyWalk.metrics(),
      framing: window.__toyWalk.framing(),
    })),
    null,
    2,
  ),
)
await page.setViewportSize({ width: 390, height: 844 })
await page.screenshot({ path: `${out}/mobile-first.png` })
await browser.close()
