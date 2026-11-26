import { chromium } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
const out = '.work/toy-character/savanna-walk2'
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const result = []
for (const name of ['desktop', 'mobile']) {
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#262626;display:grid;place-items:center;height:100vh"><video controls autoplay style="max-width:100%;max-height:100vh" src="${name}.webm"></video>`
  await fs.writeFile(`${out}/review-${name}.html`, html)
  await page.goto(pathToFileURL(path.resolve(out, `review-${name}.html`)).href)
  await page.waitForFunction(
    () => document.querySelector('video').readyState >= 3,
  )
  await page.evaluate(() => document.querySelector('video').play())
  await page.waitForTimeout(2200)
  const first = await page.evaluate(() => {
    const v = document.querySelector('video')
    return {
      time: v.currentTime,
      decoded: v.getVideoPlaybackQuality().totalVideoFrames,
      duration: v.duration,
      width: v.videoWidth,
      height: v.videoHeight,
    }
  })
  await page.screenshot({ path: `${out}/video-${name}-playing.png` })
  await page.evaluate(async () => {
    const v = document.querySelector('video')
    v.currentTime = 26
    await new Promise((r) => v.addEventListener('seeked', r, { once: true }))
    await v.play()
  })
  await page.waitForTimeout(4500)
  const after = await page.evaluate(() => {
    const v = document.querySelector('video')
    return {
      time: v.currentTime,
      decoded: v.getVideoPlaybackQuality().totalVideoFrames,
    }
  })
  await page.screenshot({ path: `${out}/video-${name}-stop-resume.png` })
  result.push({ name, first, after })
}
await fs.writeFile(`${out}/video-review.json`, JSON.stringify(result, null, 2))
await browser.close()
console.log(result)
