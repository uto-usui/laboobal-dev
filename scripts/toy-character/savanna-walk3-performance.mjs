import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const out = '.work/toy-character/savanna-walk3'
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
const report = []
for (const [name, width, height, dpr] of [
  ['desktop', 1440, 900, 2],
  ['mobile', 390, 844, 3],
]) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    isMobile: name === 'mobile',
    hasTouch: name === 'mobile',
  })
  const page = await context.newPage()
  await page.goto('http://localhost:4410/toy-figure/?walk-inspect')
  await page.waitForFunction(() => window.__toyWalk)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await page.waitForTimeout(1500)
  const result = await page.evaluate(async () => {
    const gl = document.querySelector('canvas').getContext('webgl2')
    const extension = gl.getExtension('WEBGL_debug_renderer_info')
    const gpu = extension
      ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER)
    const buffer = [gl.drawingBufferWidth, gl.drawingBufferHeight]
    const times = []
    const start = performance.now()
    let previous
    await new Promise((resolve) => {
      const frame = (now) => {
        if (previous !== undefined) times.push(now - previous)
        previous = now
        if (now - start < 10000) requestAnimationFrame(frame)
        else resolve()
      }
      requestAnimationFrame(frame)
    })
    const sorted = times.toSorted((a, b) => a - b)
    return {
      gpu,
      buffer,
      samples: times.length,
      medianMs: sorted[Math.floor(sorted.length * 0.5)],
      p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
      rawFrameTimesMs: times,
      snapshot: window.__toyWalk.snapshot(),
    }
  })
  report.push({ name, width, height, dpr, cpuThrottling: 4, ...result })
  await context.close()
}
await fs.writeFile(
  `${out}/performance.json`,
  JSON.stringify({ browser: browser.version(), report }, null, 2),
)
console.log(report.map(({ snapshot, rawFrameTimesMs, ...row }) => row))
await browser.close()
