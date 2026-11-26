import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const out = '.work/toy-character/dino2'
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})
await page.routeWebSocket('**/*', () => {})
await page.goto('http://localhost:4410/toy-figure/?walk-inspect')
await page.waitForFunction(
  () =>
    window.__toyWalk &&
    document.querySelector('.toy-figure').getAttribute('aria-busy') === 'false',
)
const hit = await page.evaluate(async () => {
  const url = performance
    .getEntriesByType('resource')
    .map((r) => r.name)
    .find((u) => /\/three\.js\?/.test(u))
  const T = await import(url)
  const api = window.__toyWalk
  api.controls.paused = true
  for (let i = 0; i < 1200; i++) {
    api.advance(1 / 60, false)
    const view = api.sceneFrame()
    const a = view.animalBounds.find((a) => a.minX > -0.95 && a.maxX < 0.95)
    if (a) {
      const { scene, camera } = api.objects()
      const root = scene.children.find((o) => o.name === 'T-Rex')
      const ray = new T.Raycaster()
      for (let y = 0.2; y < 0.9; y += 0.15)
        for (let x = 0.2; x < 0.9; x += 0.15) {
          const px = a.minX + (a.maxX - a.minX) * x,
            py = a.minY + (a.maxY - a.minY) * y
          ray.setFromCamera(new T.Vector2(px, py), camera)
          if (
            ray.intersectObject(root, true).some((h) => h.object.isSkinnedMesh)
          ) {
            api.advance(0)
            return { x: (px + 1) * 720, y: (1 - py) * 450, index: a.species }
          }
        }
    }
  }
  throw Error('No animal entered the frame')
})
await page.mouse.click(hit.x, hit.y)
await page.evaluate(() => {
  window.__toyWalk.controls.paused = false
})
await page.waitForTimeout(800)
const looked = await page.evaluate(() => window.__toyWalk.snapshot())
await page.screenshot({ path: `${out}/animal-look.png` })
if (looked.lookTarget !== hit.index || looked.state !== 'look')
  throw Error(JSON.stringify({ hit, looked }))
await page.waitForTimeout(2400)
const resumed = await page.evaluate(() => window.__toyWalk.snapshot())
if (resumed.state !== 'walk') throw Error('Walk did not resume')
await page.mouse.move(1300, 200)
await page.waitForTimeout(400)
const tracking = await page.evaluate(() => window.__toyWalk.snapshot())
if (tracking.gaze[0] < 0.5 || tracking.state !== 'walk')
  throw Error('Gaze did not follow pointer during walking')
await fs.writeFile(
  `${out}/interaction-report.json`,
  JSON.stringify({ hit, looked, resumed, tracking }, null, 2),
)
await browser.close()
console.log('Animal picking, gaze and resumed walking passed')
