import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import http from 'node:http'
const out = process.env.DINO_CAPTURE_OUT ?? '.work/toy-character/dino3',
  results = []
const server = http.createServer(async (req, res) => {
  const name = req.url.includes('mobile') ? 'mobile' : 'desktop'
  if (!req.url.endsWith('.webm')) {
    res.setHeader('content-type', 'text/html')
    res.end(
      `<body style="margin:0"><video style="width:100vw;height:100vh" muted playsinline src="/${name}.webm"></video></body>`,
    )
    return
  }
  const bytes = await fs.readFile(`${out}/${name}.webm`)
  res.setHeader('content-type', 'video/webm')
  res.setHeader('accept-ranges', 'bytes')
  const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/)
  const start = range ? Number(range[1]) : 0,
    end = range?.[2] ? Number(range[2]) : bytes.length - 1
  if (range) {
    res.statusCode = 206
    res.setHeader('content-range', `bytes ${start}-${end}/${bytes.length}`)
  }
  res.setHeader('content-length', end - start + 1)
  res.end(bytes.subarray(start, end + 1))
})
await new Promise((resolve) => server.listen(4424, '127.0.0.1', resolve))
const b = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
for (const name of ['desktop', 'mobile']) {
  const id = name,
    w = name === 'desktop' ? 1440 : 390,
    h = name === 'desktop' ? 900 : 844
  const p = await b.newPage({ viewport: { width: w, height: h } })
  await p.goto(`http://127.0.0.1:4424/${name}`)
  await p.waitForFunction(() => document.querySelector('video').readyState >= 2)
  const info = await p.locator('video').evaluate((v) => ({
    duration: v.duration,
    width: v.videoWidth,
    height: v.videoHeight,
  }))
  const samples = []
  const moments = [8, 24, 27, 29, 40, 45, 54, 75, 84, 110, 124, 138, 155, 170]
  for (const t of moments.filter((time) => time + 0.75 < info.duration)) {
    await p.locator('video').evaluate(async (v, t) => {
      v.currentTime = t
      await new Promise((r) => v.addEventListener('seeked', r, { once: true }))
      await v.play()
    }, t)
    await p.waitForTimeout(350)
    const actual = await p.locator('video').evaluate((v) => {
      v.pause()
      let c = document.querySelector('canvas')
      if (!c) {
        c = document.createElement('canvas')
        document.body.append(c)
        c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh'
      }
      c.width = v.videoWidth
      c.height = v.videoHeight
      c.getContext('2d').drawImage(v, 0, 0)
      return v.currentTime
    })
    samples.push({ requested: t, actual })
    if (Math.abs(actual - t) > 0.8) throw Error('Seek did not reach target')
    await p.screenshot({ path: `${out}/review-${id}-${t}.png` })
  }
  results.push({
    id,
    ...info,
    samples,
    decodedFrames: await p
      .locator('video')
      .evaluate((v) => v.getVideoPlaybackQuality().totalVideoFrames),
  })
  await p.close()
}
await fs.writeFile(`${out}/video-review.json`, JSON.stringify(results, null, 2))
await b.close()
await new Promise((resolve) => server.close(resolve))
