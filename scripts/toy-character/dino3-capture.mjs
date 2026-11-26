import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
const out = process.env.DINO_CAPTURE_OUT ?? '.work/toy-character/dino3'
const movieSeconds = process.env.DINO_CAPTURE_VIDEO_SECONDS ?? '125'
const b = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal', '--enable-precise-memory-info'],
})
for (const [name, w, h, dpr, seconds] of [
  ['desktop', 1440, 900, 2, 181],
  ['mobile', 390, 844, 3, 181],
])
  for (const angle of [30]) {
    if (process.env.DINO_VIEWPORT && process.env.DINO_VIEWPORT !== name)
      continue
    const id = name
    const context = await b.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: dpr,
      isMobile: name === 'mobile',
      hasTouch: name === 'mobile',
      recordVideo: { dir: `${out}/raw-video`, size: { width: w, height: h } },
    })
    const p = await context.newPage()
    const errors = []
    p.on('pageerror', (e) => errors.push(e.message))
    await p.routeWebSocket('**/*', () => {})
    const videoStart = Date.now()
    await p.goto(`http://localhost:4410/toy-figure/?walk-inspect&view=${angle}`)
    await p.waitForFunction(
      () =>
        window.__toyWalk &&
        document.querySelector('.toy-figure').getAttribute('aria-busy') ===
          'false',
    )
    await p.waitForTimeout(500)
    const trim = (Date.now() - videoStart) / 1000
    const cdp = await context.newCDPSession(p)
    await cdp.send('Performance.enable')
    const heap = async () => {
      const r = await cdp.send('Performance.getMetrics')
      return r.metrics.find((m) => m.name === 'JSHeapUsedSize').value
    }
    await cdp.send('HeapProfiler.collectGarbage')
    const heapStart = await heap()
    await p.evaluate(() => window.__toyWalk.beginMetrics())
    const origin = await p.evaluate(() => performance.timeOrigin)
    const started = Date.now()
    const timeline = []
    let clicked = false
    while (Date.now() - started < seconds * 1000) {
      const elapsed = (Date.now() - started) / 1000
      if (!clicked && elapsed >= 26) {
        if (name === 'mobile') await p.touchscreen.tap(w * 0.18, h * 0.55)
        else await p.mouse.click(w * 0.8, h * 0.45)
        clicked = true
      }
      const row = await p.evaluate(() => ({
        snapshot: window.__toyWalk.snapshot(),
        view: window.__toyWalk.sceneFrame(),
        timeOrigin: performance.timeOrigin,
      }))
      if (row.timeOrigin !== origin) throw Error('Page reloaded')
      timeline.push({ elapsed, ...row })
      if (timeline.length % 20 === 0)
        console.log(
          id,
          Math.round(elapsed),
          row.snapshot.state,
          row.snapshot.scenery.appearances,
        )
      await p.waitForTimeout(1000)
    }
    const heapEnd = await heap()
    await cdp.send('HeapProfiler.collectGarbage')
    const heapAfterGc = await heap()
    const metrics = await p.evaluate(() => window.__toyWalk.metrics())
    const renderer = await p.evaluate(() => {
      const gl = document
          .querySelector('.toy-figure canvas')
          .getContext('webgl2'),
        e = gl.getExtension('WEBGL_debug_renderer_info')
      return gl.getParameter(e.UNMASKED_RENDERER_WEBGL)
    })
    await fs.writeFile(
      `${out}/${id}-metrics.json`,
      JSON.stringify(
        {
          id,
          width: w,
          height: h,
          dpr,
          seconds: (Date.now() - started) / 1000,
          heapStart,
          heapEnd,
          heapAfterGc,
          renderer,
          errors,
          metrics,
          timeline,
        },
        null,
        2,
      ),
    )
    const raw = await p.video().path()
    await context.close()
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        raw,
        '-ss',
        String(trim),
        '-t',
        movieSeconds,
        '-c:v',
        'libvpx-vp9',
        '-deadline',
        'realtime',
        '-cpu-used',
        '4',
        '-crf',
        '28',
        '-b:v',
        '0',
        `${out}/${id}.webm`,
      ],
      { stdio: 'ignore' },
    )
    console.log(id, 'saved')
  }
await b.close()
