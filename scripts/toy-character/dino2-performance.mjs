import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const out = '.work/toy-character/dino2',
  results = []
const b = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
for (const [name, w, h, dpr] of [
  ['desktop', 1440, 900, 2],
  ['mobile', 390, 844, 3],
])
  for (const angle of [30]) {
    const p = await b.newPage({
      viewport: { width: w, height: h },
      deviceScaleFactor: dpr,
    })
    await p.routeWebSocket('**/*', () => {})
    await p.goto(`http://localhost:4410/toy-figure/?walk-inspect&view=${angle}`)
    await p.waitForFunction(
      () =>
        window.__toyWalk &&
        document.querySelector('.toy-figure').getAttribute('aria-busy') ===
          'false',
    )
    await p.waitForTimeout(5000)
    const cdp = await p.context().newCDPSession(p)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    const a = await p.evaluate(
      () =>
        new Promise((resolve) => {
          const frames = []
          let start, last
          function frame(t) {
            start ??= t
            if (last !== undefined) frames.push(t - last)
            last = t
            if (t - start >= 10000) resolve(frames)
            else requestAnimationFrame(frame)
          }
          requestAnimationFrame(frame)
        }),
    )
    const s = a.toSorted((a, b) => a - b)
    results.push({
      name,
      angle,
      w,
      h,
      dpr,
      cpuThrottling: 4,
      seconds: a.reduce((a, b) => a + b, 0) / 1000,
      samples: a.length,
      medianMs: s[Math.floor(s.length * 0.5)],
      p95Ms: s[Math.ceil(s.length * 0.95) - 1],
      maxMs: s.at(-1),
    })
    console.log(results.at(-1))
    await p.close()
  }
await fs.writeFile(`${out}/performance.json`, JSON.stringify(results, null, 2))
await b.close()
