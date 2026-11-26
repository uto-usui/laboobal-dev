import { chromium } from '@playwright/test'
const out = '.work/toy-character/dino',
  b = await chromium.launch({
    channel: 'chrome',
    args: ['--enable-gpu', '--use-angle=metal'],
  })
const p = await b.newPage({ viewport: { width: 800, height: 500 } })
await p.routeWebSocket('**/*', () => {})
await p.goto('http://localhost:4410/toy-figure/?walk-inspect')
await p.waitForFunction(
  () =>
    window.__toyWalk &&
    document.querySelector('.toy-figure').getAttribute('aria-busy') === 'false',
)
await p.evaluate(async () => {
  window.__toyWalk.controls.paused = true
  const url = performance
    .getEntriesByType('resource')
    .map((r) => r.name)
    .find((u) => /\/three\.js\?/.test(u))
  const T = await import(url)
  const renderer = new T.WebGLRenderer({ antialias: true })
  renderer.setSize(800, 500)
  renderer.toneMapping = T.NeutralToneMapping
  renderer.domElement.style.cssText = 'position:fixed;inset:0;z-index:1000'
  document.body.append(renderer.domElement)
  const { scene } = window.__toyWalk.objects()
  scene.environment = null
  scene.add(new T.AmbientLight(0xffffff, 2))
  window.__dinoPose = { T, renderer, time: 0 }
})
for (const [i, name] of [
  'T-Rex',
  'Velociraptor',
  'Triceratops',
  'Parasaurolophus',
  'Stegosaurus',
  'Apatosaurus',
].entries()) {
  for (let phase = 0; phase < 3; phase++) {
    await p.evaluate(
      ({ i, name, phase }) => {
        const { T, renderer } = window.__dinoPose,
          a = window.__toyWalk
        const target = 4 + i * 15 + phase / 5
        while (window.__dinoPose.time < target - 1e-7) {
          const dt = Math.min(1 / 60, target - window.__dinoPose.time)
          a.advance(dt, false)
          window.__dinoPose.time += dt
        }
        const { scene } = a.objects(),
          root = scene.children.find((o) => o.name === name)
        for (const o of scene.children)
          o.visible =
            o === root ||
            o.isLight === true ||
            (o.isMesh === true &&
              o.geometry.type === 'PlaneGeometry' &&
              o.geometry.parameters.width === 300)
        root.visible = true
        root.updateMatrixWorld(true)
        const box = new T.Box3().setFromObject(root.children[0], true),
          size = box.getSize(new T.Vector3()),
          center = box.getCenter(new T.Vector3()),
          camera = new T.PerspectiveCamera(35, 1.6, 0.01, 150)
        const direction = new T.Vector3(0.7, 0.32, 1)
          .applyAxisAngle(new T.Vector3(0, 1, 0), root.rotation.y)
          .normalize()
        camera.position
          .copy(center)
          .addScaledVector(direction, Math.max(size.x, size.y, size.z) * 1.9)
        camera.lookAt(center)
        renderer.render(scene, camera)
      },
      { i, name, phase },
    )
    await p.screenshot({ path: `${out}/pose-${i}-${phase}.png` })
  }
}
await b.close()
