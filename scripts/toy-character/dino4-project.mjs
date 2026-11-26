import fs from 'node:fs/promises'
import { chromium } from '@playwright/test'

const out = '.work/toy-character/dino4'
const bake = JSON.parse(await fs.readFile(`${out}/bake.json`, 'utf8'))
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  })
  await page.routeWebSocket('**/*', () => {})
  await page.goto('http://localhost:4410/toy-figure/?walk-inspect&view=30')
  await page.waitForFunction(
    () =>
      window.__toyWalk &&
      document.querySelector('.toy-figure').getAttribute('aria-busy') ===
        'false',
  )
  const feet = await page.evaluate(async (bake) => {
    const walk = window.__toyWalk
    walk.controls.paused = true
    const { scene, camera } = walk.objects()
    const { dinosaurFeet } = await import(
      '/src/demos/toy-figure/dinosaur-feet.ts'
    )
    const models = bake.map(({ name, duration }) => {
      const root = scene.getObjectByName(name)
      const model = root.children[0]
      const { stance } = model.userData.quadrupedWalk
      const sampler = dinosaurFeet(root, model, 0)
      const feet = sampler.feet.map(({ bone: { name } }) => ({
        name,
        range: stance[name],
        contacts: 0,
        maxPx: 0,
        maxMm: 0,
        samples: [],
        beganDuringWalk: false,
      }))
      return {
        name,
        duration,
        root,
        sampler,
        feet,
      }
    })
    for (let i = 0; i < 180 * 60; i++) {
      walk.advance(1 / 60, false)
      const { origin, scenery } = walk.snapshot()
      for (const animal of models) {
        const { name, duration, root, sampler, feet } = animal
        if (!root.visible) {
          for (const foot of feet) {
            foot.beganDuringWalk = false
            foot.samples.length = 0
          }
          continue
        }
        const { age, rate } = scenery.animals.find((a) => a.species === name)
        const t = (age * rate) % duration
        const soles = sampler.sample()
        for (const [j, foot] of feet.entries()) {
          const [start, end] = foot.range
          const planted =
            start < end ? t >= start && t < end : t >= start || t < end
          if (planted && foot.beganDuringWalk) {
            const world = root.localToWorld(soles[j])
            world.z += origin
            foot.samples.push({ world, visible: root.userData.entered })
            continue
          }
          if (planted) continue
          foot.beganDuringWalk = true
          const samples = foot.samples
          foot.samples = []
          if (samples.length < 2) continue
          if (!samples.every(({ visible }) => visible)) continue
          foot.contacts++

          // カメラの移動を含めないよう、接地ごとに同じ時点のカメラで投影する。
          const projected = samples.map(({ world }) => {
            const point = world.clone()
            point.z -= origin
            return point.project(camera)
          })
          for (let n = 1; n < projected.length; n++) {
            for (let k = 0; k < n; k++) {
              const a = projected[n],
                b = projected[k]
              foot.maxPx = Math.max(
                foot.maxPx,
                Math.hypot((a.x - b.x) * 720, (a.y - b.y) * 450),
              )
              foot.maxMm = Math.max(
                foot.maxMm,
                samples[n].world.distanceTo(samples[k].world) * 1000,
              )
            }
          }
        }
      }
    }
    return models.map(({ name, feet }) => ({
      name,
      feet: feet.map(({ name, contacts, maxPx, maxMm }) => ({
        name,
        contacts,
        maxPx,
        maxMm,
      })),
    }))
  }, bake)
  await fs.writeFile(
    `${out}/feet-projection.json`,
    `${JSON.stringify(feet, null, 2)}\n`,
  )
  console.log(JSON.stringify(feet, null, 2))
} finally {
  await browser.close()
}
