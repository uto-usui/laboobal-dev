import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const out = '.work/toy-character/dino',
  results = []
const b = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
for (const name of ['desktop', 'mobile'])
  for (const angle of [30, 50]) {
    const id = `${name}-${angle}`,
      w = name === 'desktop' ? 1440 : 390,
      h = name === 'desktop' ? 900 : 844
    const p = await b.newPage({ viewport: { width: w, height: h } })
    await p.route('**/__dino-video__/*.webm', async (route) =>
      route.fulfill({
        contentType: 'video/webm',
        body: await fs.readFile(`${out}/${id}.webm`),
      }),
    )
    await p.route('**/__dino-video-review__', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><body style="margin:0;background:#222"><video style="width:100vw;height:100vh" muted playsinline src="/__dino-video__/${id}.webm"></video>`,
      }),
    )
    await p.goto('http://localhost:4410/__dino-video-review__')
    await p.waitForFunction(
      () => document.querySelector('video').readyState >= 2,
    )
    const info = await p.locator('video').evaluate((v) => ({
      duration: v.duration,
      width: v.videoWidth,
      height: v.videoHeight,
    }))
    for (const t of [8, 24, 27, 29, 40, 54, 64]) {
      await p.locator('video').evaluate(async (v, t) => {
        v.currentTime = t
        await new Promise((r) =>
          v.addEventListener('seeked', r, { once: true }),
        )
        await v.play()
      }, t)
      await p.waitForTimeout(350)
      await p.locator('video').evaluate((v) => v.pause())
      await p.screenshot({ path: `${out}/review-${id}-${t}.png` })
    }
    results.push({
      id,
      ...info,
      decodedFrames: await p
        .locator('video')
        .evaluate((v) => v.getVideoPlaybackQuality().totalVideoFrames),
    })
    await p.close()
  }
await fs.writeFile(`${out}/video-review.json`, JSON.stringify(results, null, 2))
await b.close()
