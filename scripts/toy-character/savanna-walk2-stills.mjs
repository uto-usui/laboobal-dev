import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const out = '.work/toy-character/savanna-walk2'
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})
page.on('pageerror', console.log)
await page.goto('http://localhost:4410/toy-figure/?walk-inspect')
await page.waitForFunction(() => window.__toyWalk)
await page.waitForTimeout(100)
await page.evaluate(() => {
  const a = window.__toyWalk
  a.controls.paused = true
  for (let i = 0; i < 2400; i++) a.advance(1 / 120)
})
const legs = []
for (let i = 0; i < 9; i++) {
  if (i) await page.evaluate(() => window.__toyWalk.advance(1 / 12))
  legs.push(await page.evaluate(() => window.__toyWalk.snapshot()))
  await page.screenshot({
    path: `${out}/legs-${i}.png`,
    clip: { x: 580, y: 475, width: 360, height: 285 },
    scale: 'css',
  })
}
await fs.writeFile(`${out}/legs.json`, JSON.stringify(legs, null, 2))
await page.setViewportSize({ width: 400, height: 550 })
await page.waitForTimeout(200)
// 左右が同じ位置へ戻る二歩0.68秒を、以前と同じ8コマに分ける。
for (let i = 0; i < 8; i++) {
  for (const [name, angle] of [
    ['side', Math.PI / 2],
    ['front', 0],
  ]) {
    await page.evaluate((angle) => {
      const a = window.__toyWalk
      a.controls.view = angle
      a.advance(0)
    }, angle)
    await page.screenshot({
      path: `${out}/cycle-${name}-${i}.png`,
      scale: 'css',
    })
  }
  await page.evaluate(() => window.__toyWalk.advance(0.085))
}
await browser.close()
