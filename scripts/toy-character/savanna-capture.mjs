import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { chromium } from '@playwright/test'

const out = '.work/toy-character/savanna'
const req = createRequire(path.resolve(out, 'tooling/package.json'))
const sharp = req('sharp')
const base = process.env.SAVANNA_BASE_URL ?? 'http://127.0.0.1:4431'
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-gpu', '--use-angle=metal'],
})
const errors = [],
  shots = [],
  measurements = []
const sizes = [
  ['desktop', 1440, 900, 2],
  ['medium', 800, 500, 2],
  ['mobile', 390, 844, 3],
]
await fs.mkdir(`${out}/shots`, { recursive: true })
try {
  for (const variant of ['S', 'D'])
    for (const [name, width, height, dpr] of sizes) {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: dpr,
      })
      const page = await context.newPage()
      page.on('pageerror', (e) => errors.push(e.message))
      page.on('response', (r) => {
        if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`)
      })
      await page.goto(
        `${base}/.work/toy-character/savanna/?variant=${variant}&capture`,
      )
      await page.waitForFunction(() => window.cityReview?.ready, null, {
        timeout: 120000,
      })
      await page.evaluate(() => cityReview.measure(800))
      const details = await page.evaluate(() => {
        const r = cityReview
        const p = r.framing.characterBounds
        const range = (axis) => [
          Math.min(...p.map((p) => p[axis])),
          Math.max(...p.map((p) => p[axis])),
        ]
        return {
          gpu: r.gpu,
          pose: r.pose,
          framing: r.framing,
          rangeX: range(0),
          rangeY: range(1),
          placements: r.placements,
          visibleObjects: r.visibleObjects(),
          bodyOcclusions: r.bodyOcclusions(),
          faceOcclusions: r.faceOcclusions(),
        }
      })
      assert(!/swiftshader|llvmpipe|software/i.test(details.gpu), details.gpu)
      assert(
        details.rangeX[0] > -0.98 && details.rangeX[1] < 0.98,
        'Hands clipped',
      )
      assert(
        details.rangeY[0] > -0.98 && details.rangeY[1] < 0.98,
        'Head or feet clipped',
      )
      assert(
        details.pose.knees.every((k) => k >= 0 && k <= 40.001),
        'Knee range',
      )
      assert(
        details.pose.feet.every(
          (f) => f.thigh <= 25.001 && f.ankleAngle <= 30.001,
        ),
        'Leg range',
      )
      assert.deepEqual(
        details.faceOcclusions,
        [],
        'Landscape obstructs the face',
      )
      assert.deepEqual(
        details.bodyOcclusions,
        [],
        'Landscape obstructs the body',
      )
      assert(
        details.visibleObjects.length >= 4 &&
          details.visibleObjects.length <= 8,
        'Visible prop count outside 4–8',
      )
      const file = `shots/${variant}-${name}.png`
      await page.screenshot({ path: `${out}/${file}` })
      shots.push({ variant, name, width, height, dpr, file, ...details })
      if (name !== 'medium') {
        const cdp = await context.newCDPSession(page)
        // Report both rates at both sizes so the mobile-only reading is also covered.
        for (const rate of [1, 4]) {
          await cdp.send('Emulation.setCPUThrottlingRate', { rate })
          await page.evaluate(() => cityReview.measure(800))
          const result = await page.evaluate(() => cityReview.measure(5000))
          measurements.push({
            variant,
            name,
            width,
            height,
            dpr,
            cpuThrottling: rate,
            gpu: details.gpu,
            ...result,
          })
          console.log(
            JSON.stringify({
              variant,
              name,
              rate,
              raf: result.raf,
              renderSubmission: result.renderSubmission,
            }),
          )
        }
      }
      await context.close()
    }
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
const label = (text, w, h = 48) =>
  Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f5f3ed"/><text x="14" y="30" fill="#454b48" font-size="18" font-family="sans-serif">${text}</text></svg>`,
  )
for (const variant of ['S', 'D']) {
  const composite = []
  let left = 20
  for (const shot of shots.filter((s) => s.variant === variant)) {
    composite.push({
      input: label(
        `${shot.width} × ${shot.height} · DPR ${shot.dpr}`,
        shot.width,
      ),
      left,
      top: 64,
    })
    composite.push({
      input: await sharp(`${out}/${shot.file}`)
        .resize(shot.width, shot.height)
        .png()
        .toBuffer(),
      left,
      top: 112,
    })
    left += shot.width + 20
  }
  composite.push({
    input: label(variant === 'S' ? 'S / SAVANNA' : 'D / DRY SANDLAND', left),
    left: 0,
    top: 8,
  })
  await sharp({
    create: { width: left, height: 1032, channels: 3, background: '#f5f3ed' },
  })
    .composite(composite)
    .png()
    .toFile(`${out}/savanna-${variant}.png`)
}
const comp = []
for (const [i, variant] of ['S', 'D', 'B'].entries()) {
  const left = 20 + i * 1460
  comp.push({
    input: label(
      variant === 'S'
        ? 'S / SAVANNA'
        : variant === 'D'
          ? 'D / DRY SANDLAND'
          : 'B / PREVIOUS CITY',
      1440,
    ),
    left,
    top: 8,
  })
  comp.push({
    input: await sharp(
      variant === 'B'
        ? '.work/toy-character/city/shots/B-desktop.png'
        : `${out}/shots/${variant}-desktop.png`,
    )
      .resize(1440, 900)
      .png()
      .toBuffer(),
    left,
    top: 56,
  })
}
await sharp({
  create: { width: 4400, height: 976, channels: 3, background: '#f5f3ed' },
})
  .composite(comp)
  .png()
  .toFile(`${out}/compare.png`)
await fs.writeFile(
  `${out}/capture-report.json`,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      chrome: browser.version(),
      platform: process.platform,
      arch: process.arch,
      launch: {
        channel: 'chrome',
        headless: true,
        args: ['--enable-gpu', '--use-angle=metal'],
      },
      errors,
      shots,
      measurements,
    },
    null,
    2,
  ) + '\n',
)
console.log(
  'Saved savanna-S.png, savanna-D.png, compare.png and capture-report.json',
)
