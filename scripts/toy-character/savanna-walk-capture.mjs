import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
const out = '.work/toy-character/savanna-walk'
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal', '--enable-precise-memory-info'],
})
const stats = (values) => {
  const a = values.toSorted((a, b) => a - b)
  return {
    samples: a.length,
    min: a[0],
    median: a[Math.floor(a.length * 0.5)],
    p95: a[Math.ceil(a.length * 0.95) - 1],
    max: a.at(-1),
  }
}
const mobileOnly = process.argv.includes('--mobile-only')
const report = mobileOnly
  ? JSON.parse(await fs.readFile(`${out}/capture-report.json`))
  : {
      browser: browser.version(),
      startedAt: new Date().toISOString(),
      errors: [],
    }
for (const [name, width, height, dpr, seconds] of mobileOnly
  ? [['mobile', 390, 844, 3, 66]]
  : [
      ['desktop', 1440, 900, 2, 180],
      ['mobile', 390, 844, 3, 66],
    ]) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    isMobile: name === 'mobile',
    hasTouch: name === 'mobile',
    recordVideo: { dir: `${out}/raw-video`, size: { width, height } },
  })
  const page = await context.newPage()
  // 記録中に文書を保存しても、Vite の通知で計測が初めに戻らないようにする。
  await page.routeWebSocket('**/*', () => {})
  page.on('pageerror', (e) => report.errors.push(e.message))
  await page.goto('http://localhost:4410/toy-figure/?walk-inspect')
  await page.waitForFunction(
    () =>
      window.__toyWalk &&
      document.querySelector('.toy-figure').getAttribute('aria-busy') ===
        'false',
  )
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  const heap = async () => {
    const m = await cdp.send('Performance.getMetrics')
    return m.metrics.find((x) => x.name === 'JSHeapUsedSize').value
  }
  const heapStart = await heap()
  await page.evaluate(() => window.__toyWalk.beginMetrics())
  const timeOrigin = await page.evaluate(() => performance.timeOrigin)
  const started = Date.now()
  const timeline = []
  let clicked = false
  while (Date.now() - started < seconds * 1000) {
    const elapsed = (Date.now() - started) / 1000
    if (!clicked && elapsed >= 26) {
      if (name === 'mobile')
        await page.touchscreen.tap(width * 0.18, height * 0.55)
      else await page.mouse.click(width * 0.8, height * 0.45)
      clicked = true
    }
    const sample = await page.evaluate(() => ({
      timeOrigin: performance.timeOrigin,
      snapshot: window.__toyWalk.snapshot(),
      view: window.__toyWalk.sceneFrame(),
      framing: window.__toyWalk.framing(),
    }))
    if (sample.timeOrigin !== timeOrigin)
      throw new Error('Page reloaded during recording')
    timeline.push({ elapsed, ...sample })
    if (timeline.length % 10 === 0)
      console.log(
        name,
        Math.round(elapsed),
        sample.snapshot.state,
        sample.snapshot.scenery.appearances,
      )
    await page.waitForTimeout(1000)
  }
  const heapEnd = await heap()
  const metrics = await page.evaluate(() => window.__toyWalk.metrics())
  const video = page.video()
  const rawVideo = await video.path()
  report[name] = {
    width,
    height,
    dpr,
    seconds: (Date.now() - started) / 1000,
    heapStartBytes: heapStart,
    heapEndBytes: heapEnd,
    cameraDisplacementM: stats(metrics.cameraDeltas),
    cameraSpeedMps: stats(metrics.cameraSpeeds),
    cameraMaxToMedian:
      Math.max(...metrics.cameraDeltas) / stats(metrics.cameraDeltas).median,
    metrics,
    timeline,
  }
  await fs.writeFile(
    `${out}/${name}-metrics.json`,
    JSON.stringify(report[name], null, 2),
  )
  await context.close()
  execFileSync(
    'ffmpeg',
    ['-y', '-i', rawVideo, '-t', '66', '-c', 'copy', `${out}/${name}.webm`],
    { stdio: 'ignore' },
  )
}
await fs.writeFile(
  `${out}/capture-report.json`,
  JSON.stringify(report, null, 2),
)
await browser.close()
