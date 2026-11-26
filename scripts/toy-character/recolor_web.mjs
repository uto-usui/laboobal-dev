/** Capture the real demo at a fixed pose; only the response is instrumented. */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
const out = '.work/toy-character/recolor'
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await context.route('**/src/demos/toy-figure/main.ts*', async (route) => {
  const r = await route.fetch()
  let s = await r.text()
  s = s.replace(
    'loop((dt, elapsed) => {',
    'window.__toyFigure = { renderer, scene, camera, character, materials };\nloop((dt, elapsed) => {',
  )
  s = s.replace(
    'const target = pointerOrWander(pointer, elapsed)',
    'const target = {x:0,y:0}',
  )
  s = s.replace('const breath = reduced ?', 'const breath = true ?')
  s = s.replace('const sinceBlink = time - blinkAt', 'const sinceBlink = -1')
  await route.fulfill({ response: r, body: s })
})
if (process.argv.includes('old'))
  await context.route('**/character.glb*', (r) =>
    r.fulfill({
      body: fs.readFileSync(`${out}/character-before.glb`),
      contentType: 'model/gltf-binary',
    }),
  )
const version = process.argv.includes('old') ? 'before' : 'after'
await page.goto('http://localhost:4410/toy-figure/')
await page.waitForFunction(
  () =>
    window.__toyFigure &&
    document.querySelector('.stage')?.getAttribute('aria-busy') === 'false',
)
await page.waitForTimeout(600)
await page.screenshot({ path: `${out}/web-${version}-full.png` })
for (const [name, clip] of Object.entries({
  face: { x: 560, y: 80, width: 320, height: 260 },
  body: { x: 520, y: 320, width: 400, height: 380 },
}))
  await page.screenshot({ path: `${out}/web-${version}-${name}.png`, clip })
// Also inspect the back with the actual Web lighting and textures.
await page.evaluate(() => {
  window.__toyFigure.character.rotation.y = Math.PI
})
await page.waitForTimeout(300)
await page.screenshot({ path: `${out}/web-${version}-back.png` })
fs.writeFileSync(
  `${out}/web-${version}.json`,
  JSON.stringify(
    {
      errors,
      ...(await page.evaluate(() => ({
        viewport: [innerWidth, innerHeight],
        dpr: devicePixelRatio,
        renderer: window.__toyFigure.renderer.info.render,
        loaded:
          document.querySelector('.stage').getAttribute('aria-busy') ===
          'false',
      }))),
    },
    null,
    2,
  ),
)
await browser.close()
if (errors.length) throw new Error(errors.join('\n'))
