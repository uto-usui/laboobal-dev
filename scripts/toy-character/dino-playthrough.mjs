import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const out = '.work/toy-character/dino',
  b = await chromium.launch({
    channel: 'chrome',
    args: ['--enable-gpu', '--use-angle=metal'],
  })
const pages = []
for (const name of ['desktop', 'mobile'])
  for (const angle of [30, 50]) {
    const id = `${name}-${angle}`,
      p = await b.newPage({
        viewport:
          name === 'desktop'
            ? { width: 1440, height: 900 }
            : { width: 390, height: 844 },
      })
    await p.route('**/__dino-playback__', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<body style="margin:0"><video style="width:100vw;height:100vh" muted autoplay playsinline src="/__dino-movie__.webm"></video>',
      }),
    )
    await p.route('**/__dino-movie__.webm', async (route) =>
      route.fulfill({
        contentType: 'video/webm',
        body: await fs.readFile(`${out}/${id}.webm`),
      }),
    )
    await p.goto('http://localhost:4410/__dino-playback__')
    pages.push({ id, p })
  }
const result = await Promise.all(
  pages.map(async ({ id, p }) => ({
    id,
    ...(await p.locator('video').evaluate(
      (v) =>
        new Promise((resolve, reject) => {
          const finish = () =>
            resolve({
              completed: v.ended,
              currentTime: v.currentTime,
              duration: v.duration,
              totalVideoFrames: v.getVideoPlaybackQuality().totalVideoFrames,
              droppedVideoFrames:
                v.getVideoPlaybackQuality().droppedVideoFrames,
            })
          v.addEventListener(
            'error',
            () => reject(Error('Video decode failed')),
            { once: true },
          )
          if (v.ended) finish()
          else v.addEventListener('ended', finish, { once: true })
        }),
    )),
  })),
)
await fs.writeFile(`${out}/playthrough.json`, JSON.stringify(result, null, 2))
console.log(result)
await b.close()
