import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const out = '.work/toy-character/dino2'
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  reducedMotion: 'reduce',
})
const page = await context.newPage()
await page.routeWebSocket('**/*', () => {})
await page.goto('http://localhost:4410/toy-figure/?walk-inspect')
await page.waitForFunction(() => window.__toyWalk)
await page.waitForTimeout(800)
await page.screenshot({ path: `${out}/reduced.png` })
const first = await page.screenshot()
const before = await page.evaluate(() => window.__toyWalk.snapshot())
await page.waitForTimeout(1500)
const reducedStill = first.equals(await page.screenshot())
await page.mouse.click(200, 500)
await page.waitForTimeout(450)
const looking = await page.evaluate(() => window.__toyWalk.snapshot())
await page.screenshot({ path: `${out}/reduced-look.png` })
await page.waitForTimeout(6500)
const settled = await page.screenshot()
await page.waitForTimeout(1000)
const reducedSettled = settled.equals(await page.screenshot())
await page.emulateMedia({ reducedMotion: 'no-preference' })
await page.waitForTimeout(800)
const resumed = await page.evaluate(() => window.__toyWalk.snapshot())
await page.setViewportSize({ width: 800, height: 500 })
await page.waitForTimeout(300)
await page.screenshot({ path: `${out}/article.png` })
await page.getByRole('button', { name: 'info', exact: true }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${out}/panel.png` })
await page.keyboard.press('Escape')
const host = 'http://localhost:4410/__dino-host__'
await page.route(host, (route) =>
  route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><meta name="viewport" content="width=device-width"><body style="margin:0"><div style="height:100px">article</div><iframe title="toy" src="/toy-figure/?walk-inspect" style="width:800px;height:500px;border:0"></iframe><div style="height:2000px"></div></body>',
  }),
)
await page.goto(host)
const frame = page.frames().find((f) => f.url().includes('/toy-figure/'))
await frame.waitForFunction(() => window.__toyWalk)
await page.waitForTimeout(1000)
await page.evaluate(() => scrollTo(0, 1500))
await page.waitForTimeout(500)
const offBefore = await frame.evaluate(() => window.__toyWalk.snapshot())
await page.waitForTimeout(1500)
const offAfter = await frame.evaluate(() => window.__toyWalk.snapshot())
await page.evaluate(() => scrollTo(0, 0))
await page.waitForTimeout(1000)
const onAfter = await frame.evaluate(() => window.__toyWalk.snapshot())
// headless Chrome の全タブは visible なので、同じ visibilitychange の経路へ非表示を渡す。
await frame.evaluate(() => {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => true,
  })
  document.dispatchEvent(new Event('visibilitychange'))
})
await page.waitForTimeout(300)
const hiddenBefore = await frame.evaluate(() => window.__toyWalk.snapshot())
await page.waitForTimeout(1000)
const hiddenAfter = await frame.evaluate(() => window.__toyWalk.snapshot())
await frame.evaluate(() => {
  delete document.hidden
  document.dispatchEvent(new Event('visibilitychange'))
})
await page.waitForTimeout(500)
const visibleAfter = await frame.evaluate(() => window.__toyWalk.snapshot())
const result = {
  reducedStill,
  reducedSettled,
  before,
  looking,
  resumed,
  offscreen: { before: offBefore, after: offAfter, resumed: onAfter },
  hidden: {
    simulatedVisibilityEvent: true,
    before: hiddenBefore,
    after: hiddenAfter,
    resumed: visibleAfter,
  },
}
await fs.writeFile(`${out}/stills-report.json`, JSON.stringify(result, null, 2))
if (
  !reducedStill ||
  !reducedSettled ||
  offBefore.frames !== offAfter.frames ||
  hiddenBefore.frames !== hiddenAfter.frames ||
  onAfter.frames <= offAfter.frames ||
  visibleAfter.frames <= hiddenAfter.frames
)
  throw Error('Static or visibility check failed')
await browser.close()
console.log('Reduced motion, gaze, offscreen and hidden-tab checks passed')
