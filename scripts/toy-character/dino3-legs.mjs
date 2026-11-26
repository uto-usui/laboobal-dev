import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const stage = process.argv[2] ?? 'before',
  out = '.work/toy-character/dino3'
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
const page = await browser.newPage({
  viewport: { width: 320, height: 240 },
  deviceScaleFactor: 1,
})
await page.routeWebSocket('**/*', () => {})
await page.goto('http://localhost:4410/toy-figure/?walk-inspect')
await page.waitForFunction(() => window.__toyWalk)
await page.evaluate(async (stage) => {
  window.__toyWalk.controls.paused = true
  const url = performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .find((u) => /\/three\.js\?/.test(u)),
    T = await import(url)
  const { GLTFLoader } = await import(
      '/node_modules/three/examples/jsm/loaders/GLTFLoader.js'
    ),
    { MeshoptDecoder } = await import(
      '/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js'
    )
  const { createDinosaur } = await import(
    stage === 'before'
      ? '/ .work/toy-character/dino3/dinosaurs-before.ts'.replace('/ ', '/')
      : '/src/demos/toy-figure/dinosaurs.ts'
  )
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),
    scene = new T.Scene()
  scene.background = new T.Color('#e5e8e4')
  scene.environment = window.__toyWalk.objects().scene.environment
  scene.environmentIntensity = 0.65
  const light = new T.DirectionalLight('#fff5e9', 2.5)
  light.position.set(-3, 8, 5)
  scene.add(light, new T.HemisphereLight('#e5edff', '#a7ac94', 1))
  const renderer = new T.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  })
  renderer.setSize(320, 240)
  renderer.toneMapping = T.NeutralToneMapping
  document.body.replaceChildren(renderer.domElement)
  document.body.style.margin = '0'
  const models = []
  for (const [name, length] of [
    ['Triceratops', 8.5],
    ['Stegosaurus', 8.5],
    ['Apatosaurus', 22],
    ['Parasaurolophus', 9.5],
  ]) {
    const g = await loader.loadAsync(
        `/src/demos/toy-figure/assets/${name}.glb`,
      ),
      a = createDinosaur(g, name, length),
      raw = createDinosaur(g, name, length),
      m = new T.AnimationMixer(raw.model),
      clip = g.animations.find((c) => c.name === 'Walk')
    m.clipAction(clip).play()
    scene.add(a.root, raw.root)
    const front = raw.model.getObjectByName('FrontUpLegL'),
      foot = raw.model.getObjectByName('FrontFootL')
    raw.root.updateMatrixWorld(true)
    const pos = front.getWorldPosition(new T.Vector3()),
      fp = foot.getWorldPosition(new T.Vector3())
    const size = (pos.y - fp.y) * 1.8
    const camera = new T.OrthographicCamera(
      (-size * 2) / 3,
      (size * 2) / 3,
      size / 2,
      -size / 2,
      0.01,
      100,
    )
    camera.position.set(30, pos.y * 0.55, pos.z)
    camera.lookAt(0, pos.y * 0.55, pos.z)
    models.push({
      name,
      a,
      raw,
      m,
      camera,
      duration: clip.duration,
      rate: name === 'Apatosaurus' ? 0.5 : 0.65,
    })
  }
  window.lab = {
    models,
    frame(index, mode, t) {
      models.forEach(({ a, raw }) => {
        a.root.visible = raw.root.visible = false
      })
      const s = models[index]
      if (mode === 'raw') {
        s.m.setTime(t)
        s.raw.root.visible = true
        s.raw.root.updateMatrixWorld(true)
        s.raw.model.traverse((o) => {
          if (o.isSkinnedMesh) o.skeleton.update()
        })
      } else {
        s.a.start(new T.Vector3(), 0)
        for (let n = 0; n < t - 1e-8; n += 1 / 120)
          s.a.update(Math.min(1 / 120, t - n) / s.rate)
        s.a.root.position.x = 0
        s.a.root.position.z = 0
        s.a.root.updateMatrixWorld(true)
        s.a.model.traverse((o) => {
          if (o.isSkinnedMesh) o.skeleton.update()
        })
      }
      renderer.render(scene, s.camera)
    },
    info: models.map((s) => ({ name: s.name, duration: s.duration })),
  }
}, stage)
const info = await page.evaluate(() => window.lab.info)
await fs.mkdir(`${out}/${stage}-legs`, { recursive: true })
for (let k = 0; k < info.length; k++) {
  const { name, duration } = info[k]
  const count = Math.ceil(duration * 12) + 1
  for (let i = 0; i < count; i++)
    for (const mode of ['raw', 'current']) {
      await page.evaluate(({ k, mode, t }) => window.lab.frame(k, mode, t), {
        k,
        mode,
        t: Math.min(i / 12, duration),
      })
      await page.screenshot({
        path: `${out}/${stage}-legs/${name}-${mode}-${String(i).padStart(3, '0')}.png`,
      })
    }
  console.log(stage, name, count)
}
await fs.writeFile(`${out}/${stage}-legs.json`, JSON.stringify(info, null, 2))
await browser.close()
