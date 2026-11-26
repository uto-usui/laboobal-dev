import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const out = '.work/toy-character/savanna-walk3'
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
const report = []
for (const [name, width, height] of [
  ['desktop', 1440, 900],
  ['mobile', 390, 844],
]) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.route(`http://video-review.test/${name}.webm`, async (route) =>
    route.fulfill({
      contentType: 'video/webm',
      body: await fs.readFile(`${out}/${name}.webm`),
    }),
  )
  await page.setContent(
    `<style>html,body{margin:0;background:#000}video{width:100vw;height:100vh;object-fit:contain}</style><video muted playsinline src="http://video-review.test/${name}.webm"></video>`,
  )
  await page.waitForFunction(
    () => document.querySelector('video').readyState >= 3,
  )
  await page.evaluate(async () => {
    const v = document.querySelector('video')
    window.__reviewFrames = []
    const frame = (_now, m) => {
      window.__reviewFrames.push({
        mediaTime: m.mediaTime,
        presentedFrames: m.presentedFrames,
      })
      if (!v.ended) v.requestVideoFrameCallback(frame)
    }
    v.requestVideoFrameCallback(frame)
    v.playbackRate = 2
    await v.play()
  })
  for (const t of [0, 15, 27, 40, 55, 65]) {
    await page.waitForFunction(
      (t) => document.querySelector('video').currentTime >= t,
      t,
      { timeout: 40000 },
    )
    await page.screenshot({ path: `${out}/review-${name}-${t}.png` })
  }
  await page.waitForFunction(
    () => document.querySelector('video').ended,
    null,
    { timeout: 40000 },
  )
  report.push(
    await page.evaluate((name) => {
      const v = document.querySelector('video')
      return {
        name,
        duration: v.duration,
        ended: v.ended,
        error: v.error,
        decodedFrames: v.getVideoPlaybackQuality().totalVideoFrames,
        droppedFrames: v.getVideoPlaybackQuality().droppedVideoFrames,
        samples: window.__reviewFrames,
      }
    }, name),
  )
  console.log(name, 'played to end')
  await page.close()
}
await fs.writeFile(`${out}/video-review.json`, JSON.stringify(report, null, 2))
await browser.close()
