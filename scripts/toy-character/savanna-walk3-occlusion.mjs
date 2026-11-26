import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const out = '.work/toy-character/savanna-walk3'
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
for (const [name, width, height] of [
  ['desktop', 1440, 900],
  ['mobile', 390, 844],
]) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.routeWebSocket('**/*', () => {})
  await page.goto('http://localhost:4410/toy-figure/?walk-inspect')
  await page.waitForFunction(() => window.__toyWalk?.objects)
  await page.waitForTimeout(200)
  const result = await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .find((u) => /\/three\.js\?/.test(u))
    const T = await import(url)
    const api = window.__toyWalk
    api.controls.paused = true
    const { scene, camera } = api.objects()
    const names = scene.children.map((o) => ({
      name: o.name,
      type: o.type,
      children: o.children.map((c) => c.name),
    }))
    const animals = scene.children.filter(
      (o) => o.children[0]?.name === 'Root_Scene',
    )
    const trees = scene.children.find(
      (o) =>
        o.children.length >= 5 &&
        o.children.every((c) => c.getObjectByName('tree_plateau')),
    )
    if (!trees || animals.length !== 2)
      return {
        names,
        animalCount: animals.length,
        treeCount: trees?.children.length,
      }
    const rect = (box) => {
      const r = {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
        minD: Infinity,
        maxD: -Infinity,
      }
      for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
          for (const z of [box.min.z, box.max.z]) {
            const p = new T.Vector3(x, y, z)
            const d = -p.clone().applyMatrix4(camera.matrixWorldInverse).z
            r.minD = Math.min(r.minD, d)
            r.maxD = Math.max(r.maxD, d)
            p.project(camera)
            r.minX = Math.min(r.minX, p.x)
            r.maxX = Math.max(r.maxX, p.x)
            r.minY = Math.min(r.minY, p.y)
            r.maxY = Math.max(r.maxY, p.y)
          }
      return r
    }
    const renderer = new T.WebGLRenderer({ antialias: false })
    renderer.setSize(innerWidth, innerHeight)
    const target = new T.WebGLRenderTarget(innerWidth, innerHeight)
    renderer.setRenderTarget(target)
    renderer.setScissorTest(true)
    const red = new T.MeshBasicMaterial({
      color: 0xff0000,
      fog: false,
      toneMapped: false,
    })
    const black = new T.MeshBasicMaterial({
      color: 0,
      fog: false,
      toneMapped: false,
    })
    const meshes = []
    for (const root of [trees, ...animals])
      root.traverse((o) => {
        if (o.isMesh)
          meshes.push({
            object: o,
            material: o.material,
            mask: root === trees ? black : red,
          })
      })
    const occludedPixels = (r) => {
      const x = Math.max(0, Math.floor(((r.minX + 1) * innerWidth) / 2) - 2)
      const y = Math.max(0, Math.floor(((r.minY + 1) * innerHeight) / 2) - 2)
      const w = Math.min(
        innerWidth - x,
        Math.ceil(((r.maxX + 1) * innerWidth) / 2) - x + 2,
      )
      const h = Math.min(
        innerHeight - y,
        Math.ceil(((r.maxY + 1) * innerHeight) / 2) - y + 2,
      )
      if (w <= 0 || h <= 0) return 0
      const saved = scene.children.map((o) => [o, o.visible])
      scene.children.forEach((o) => {
        if (o !== trees && !animals.includes(o)) o.visible = false
      })
      const background = scene.background
      scene.background = new T.Color(0)
      meshes.forEach((m) => (m.object.material = m.mask))
      renderer.setScissor(x, y, w, h)
      const counts = []
      for (const shown of [false, true]) {
        trees.visible = shown
        renderer.render(scene, camera)
        const pixels = new Uint8Array(w * h * 4)
        renderer.readRenderTargetPixels(target, x, y, w, h, pixels)
        let count = 0
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i] > 200 && pixels[i + 1] < 10 && pixels[i + 2] < 10)
            count++
        counts.push(count)
      }
      saved.forEach(([o, visible]) => (o.visible = visible))
      meshes.forEach((m) => (m.object.material = m.material))
      scene.background = background
      return counts[0] - counts[1]
    }
    let frames = 0,
      animalFrames = 0,
      occlusionFrames = 0,
      minClearance = Infinity
    const failures = []
    let candidates = 0,
      lostPixels = 0
    for (let i = 0; i < 10800; i++) {
      api.advance(1 / 60)
      frames++
      const active = animals.filter((a) => a.visible)
      if (!active.length) continue
      const visibleTrees = trees.children
        .map((t) => rect(new T.Box3().setFromObject(t)))
        .filter(
          (t) =>
            t.minD > 0 &&
            t.minD < (innerWidth < 800 ? 60 : 22) &&
            t.minX < 1 &&
            t.maxX > -1 &&
            t.minY < 1 &&
            t.maxY > -1,
        )
      for (const animal of active) {
        const a = rect(new T.Box3().setFromObject(animal.children[0], true))
        if (a.minX >= 1 || a.maxX <= -1) continue
        animalFrames++
        for (const t of visibleTrees) {
          const gap = Math.max(
            t.minX - a.maxX,
            a.minX - t.maxX,
            t.minY - a.maxY,
            a.minY - t.maxY,
          )
          if (gap > 0.035) continue
          const clearance = t.minD - a.maxD
          minClearance = Math.min(minClearance, clearance)
          if (clearance <= 0) {
            candidates++
            const lost = occludedPixels(a)
            if (!lost) continue
            occlusionFrames++
            lostPixels += lost
            if (failures.length < 8)
              failures.push({ frame: i, animal: a, tree: t })
          }
        }
      }
    }
    return {
      frames,
      candidates,
      lostPixels,
      animalFrames,
      occlusionFrames,
      minClearance,
      failures,
      names,
    }
  })
  await fs.writeFile(
    `${out}/tree-animal-${name}.json`,
    JSON.stringify(result, null, 2),
  )
  console.log(name, { ...result, names: undefined })
  await page.close()
}
await browser.close()
