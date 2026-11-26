import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const out = '.work/toy-character/savanna-walk'
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal', '--enable-precise-memory-info'],
})
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})
await page.routeWebSocket('**/*', () => {})
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto('http://localhost:4410/toy-figure/?walk-inspect')
await page.waitForFunction(() => window.__toyWalk)
await page.waitForTimeout(1000)
const cdp = await page.context().newCDPSession(page)
await cdp.send('Performance.enable')
const heap = async () => {
  const r = await cdp.send('Performance.getMetrics')
  return r.metrics.find((m) => m.name === 'JSHeapUsedSize').value
}
await cdp.send('HeapProfiler.collectGarbage')
const heapStart = await heap()
await page.evaluate(() => window.__toyWalk.beginMetrics())
const start = Date.now()
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(30000)
  console.log('elapsed', Math.round((Date.now() - start) / 1000))
}
const heapEnd = await heap()
const result = await page.evaluate(() => ({
  metrics: window.__toyWalk.metrics(),
  snapshot: window.__toyWalk.snapshot(),
  timeOrigin: performance.timeOrigin,
}))
await cdp.send('HeapProfiler.collectGarbage')
const heapAfterGc = await heap()
const stats = (a) => {
  const s = a.toSorted((a, b) => a - b)
  return {
    min: s[0],
    median: s[Math.floor(s.length / 2)],
    p95: s[Math.ceil(s.length * 0.95) - 1],
    max: s.at(-1),
  }
}
const camera = stats(result.metrics.cameraDeltas)
const seams = result.metrics.boundaries.filter((b) => b.exchange || b.rebase)
const record = {
  durationSeconds: (Date.now() - start) / 1000,
  heapStartBytes: heapStart,
  heapEndBytes: heapEnd,
  heapAfterGcBytes: heapAfterGc,
  cameraMaxToMedian: camera.max / camera.median,
  camera,
  speed: stats(result.metrics.cameraSpeeds),
  seamSpeed: stats(seams.map((s) => s.speed)),
  seamDelta: stats(seams.map((s) => s.delta)),
  errors,
  ...result,
}
await fs.writeFile(`${out}/longrun.json`, JSON.stringify(record, null, 2))
await browser.close()
console.log({ ...record, metrics: undefined, snapshot: undefined })
