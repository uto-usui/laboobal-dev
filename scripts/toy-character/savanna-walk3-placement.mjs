import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const out = '.work/toy-character/savanna-walk3'
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
const records = []
for (const [name, width, height] of [
  ['desktop', 1440, 900],
  ['mobile', 390, 844],
]) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.goto('http://localhost:4410/toy-figure/?walk-inspect')
  await page.waitForFunction(() => window.__toyWalk?.objects)
  await page.waitForTimeout(300)
  records.push(
    await page.evaluate(async (name) => {
      const url = performance
        .getEntriesByType('resource')
        .map((r) => r.name)
        .find((u) => /\/three\.js\?/.test(u))
      const T = await import(url)
      const api = window.__toyWalk
      api.controls.paused = true
      const { scene, camera } = api.objects()
      const position = api.snapshot().position
      const root = scene.children.find(
        (o) =>
          o.children.length >= 5 &&
          o.children.every((c) => c.getObjectByName('tree_plateau')),
      )
      const tree = root.children[0]
      const localBox = new T.Box3()
        .setFromObject(tree)
        .translate(tree.position.clone().negate())
      const silhouette = api.sceneFrame().characterBounds
      const frustum = new T.Frustum().setFromProjectionMatrix(
        new T.Matrix4().multiplyMatrices(
          camera.projectionMatrix,
          camera.matrixWorldInverse,
        ),
      )
      let minimumGap = Infinity,
        nearestAway = Infinity,
        firstZ = Infinity,
        lastZ = -Infinity,
        samples = 0
      const unsafe = []
      for (let z = -85; z <= 20; z += 0.01) {
        const box = localBox
          .clone()
          .translate(
            new T.Vector3(tree.position.x, tree.position.y, position[2] + z),
          )
        if (!frustum.intersectsBox(box)) continue
        const r = {
          minX: Infinity,
          maxX: -Infinity,
          minY: Infinity,
          maxY: -Infinity,
          minDepth: Infinity,
        }
        for (const x of [box.min.x, box.max.x])
          for (const y of [box.min.y, box.max.y])
            for (const zz of [box.min.z, box.max.z]) {
              const p = new T.Vector3(x, y, zz)
              r.minDepth = Math.min(
                r.minDepth,
                -p.clone().applyMatrix4(camera.matrixWorldInverse).z,
              )
              p.project(camera)
              r.minX = Math.min(r.minX, p.x)
              r.maxX = Math.max(r.maxX, p.x)
              r.minY = Math.min(r.minY, p.y)
              r.maxY = Math.max(r.maxY, p.y)
            }
        if (
          r.minDepth <= camera.near ||
          r.minDepth >= (name === 'mobile' ? 60 : 22)
        )
          continue
        samples++
        firstZ = Math.min(firstZ, z)
        lastZ = Math.max(lastZ, z)
        const gap = Math.max(
          silhouette.minX - r.maxX,
          r.minX - silhouette.maxX,
          silhouette.minY - r.maxY,
          r.minY - silhouette.maxY,
        )
        minimumGap = Math.min(minimumGap, gap)
        nearestAway = Math.min(
          nearestAway,
          -0.5 * box.max.x - (Math.sqrt(3) / 2) * (box.max.z - position[2]),
        )
        if (gap <= 0.035 && unsafe.length < 10) unsafe.push({ z, rect: r, gap })
      }
      return {
        name,
        treeX: tree.position.x,
        scale: tree.scale.toArray(),
        spacing: Math.min(
          ...root.children
            .map((t) => t.position.z)
            .sort((a, b) => a - b)
            .slice(1)
            .map(
              (z, i) =>
                z -
                root.children.map((t) => t.position.z).sort((a, b) => a - b)[i],
            ),
        ),
        fog: name === 'mobile' ? [45, 60] : [17, 22],
        silhouette,
        camera: camera.position.toArray(),
        relativeZ: [firstZ, lastZ],
        samples,
        minimumGapNdc: minimumGap,
        minimumGapPx: (minimumGap * Math.min(innerWidth, innerHeight)) / 2,
        minimumAwayMetres: nearestAway,
        unsafe,
      }
    }, name),
  )
  await page.close()
}
await fs.writeFile(`${out}/placement.json`, JSON.stringify(records, null, 2))
console.log(records)
await browser.close()
if (records.some((r) => r.unsafe.length)) process.exitCode = 1
