import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'

const out = '.work/toy-character/dino4'
const quick = process.argv.includes('--quick')
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=metal'],
})
try {
  const page = await browser.newPage({ viewport: { width: 384, height: 200 } })
  await page.routeWebSocket('**/*', () => {})
  await page.goto('http://localhost:4410/toy-figure/?walk-inspect')
  await page.waitForFunction(() => window.__toyWalk)
  await page.evaluate(async () => {
    window.__toyWalk.controls.paused = true
    const url = performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .find((u) => /\/three\.js\?/.test(u))
    const T = await import(url)
    const { GLTFLoader } = await import(
      '/node_modules/three/examples/jsm/loaders/GLTFLoader.js'
    )
    const { MeshoptDecoder } = await import(
      '/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js'
    )
    const { createDinosaur: before } = await import(
      '/.work/toy-character/dino4/dinosaurs-before.ts'
    )
    const { createDinosaur: after } = await import(
      '/src/demos/toy-figure/dinosaurs.ts'
    )
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    const scene = new T.Scene()
    scene.background = new T.Color('#e7e8dd')
    scene.environment = window.__toyWalk.objects().scene.environment
    scene.environmentIntensity = 0.65
    const light = new T.DirectionalLight('#fff5e9', 2.5)
    light.position.set(12, 10, 5)
    scene.add(light, new T.HemisphereLight('#e5edff', '#a7ac94', 1))
    const renderer = new T.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    })
    renderer.setSize(384, 200)
    renderer.toneMapping = T.NeutralToneMapping
    document.body.replaceChildren(renderer.domElement)
    document.body.style.margin = '0'
    const floor = new T.Mesh(
      new T.PlaneGeometry(60, 100),
      new T.MeshBasicMaterial({ color: '#c4c6a7' }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = 0.055
    scene.add(floor)
    const lines = []
    for (let z = -25; z <= 40; z += 0.5) lines.push(1.5, 0.061, z, 4, 0.061, z)
    lines.push(4, 0.061, -25, 4, 0.061, 40)
    const geometry = new T.BufferGeometry().setAttribute(
      'position',
      new T.Float32BufferAttribute(lines, 3),
    )
    scene.add(
      new T.LineSegments(
        geometry,
        new T.LineBasicMaterial({ color: '#747a59' }),
      ),
    )

    const models = []
    for (const [name, length, rate] of [
      ['Triceratops', 8.5, 0.65],
      ['Stegosaurus', 8.5, 0.65],
      ['Apatosaurus', 22, 0.5],
    ]) {
      const files = '/src/demos/toy-figure/assets'
      const [original, balanced] = await Promise.all([
        loader.loadAsync(`${files}/${name}.glb`),
        loader.loadAsync(`${files}/${name}-balanced.glb`),
      ])
      const raw = before(original, name, length)
      const previous = before(original, name, length)
      const corrected = after(balanced, name, length)
      const mixer = new T.AnimationMixer(raw.model)
      const clip = original.animations.find((c) => c.name === 'Walk')
      mixer.clipAction(clip).play()
      previous.start(new T.Vector3(), 0)
      for (let t = 0; t < clip.duration / rate - 1e-8; t += 1 / 120)
        previous.update(Math.min(1 / 120, clip.duration / rate - t))
      const rawSpeed = previous.inspect().walked / (clip.duration / rate)
      const stance = balanced.scene.userData.quadrupedWalk.stance.BackFootL
      const lengthOfShot = stance[1] / rate
      const stepTravel = lengthOfShot * rawSpeed
      const box = new T.Box3().setFromObject(raw.model, true)
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.01, 120)
      const hind = raw.model
        .getObjectByName('BackUpLegL')
        .getWorldPosition(new T.Vector3())
      const front = raw.model
        .getObjectByName('FrontUpLegL')
        .getWorldPosition(new T.Vector3())
      const center = (front.z + hind.z + stepTravel) / 2
      const width =
        front.z - hind.z + stepTravel + (box.max.y - box.min.y) * 0.9
      const groundAt = 0.5
      const cropHeight = (width * 200) / 384
      const cameraHeight = Math.min(cropHeight * 0.45, front.y * 0.8)
      Object.assign(camera, {
        left: -width / 2,
        right: width / 2,
        top: cropHeight / 2,
        bottom: -cropHeight / 2,
      })
      camera.updateProjectionMatrix()
      camera.position.set(50, cameraHeight + 2, center)
      camera.lookAt(0, cameraHeight - groundAt, center)
      scene.add(raw.root, previous.root, corrected.root)
      models.push({
        name,
        raw,
        previous,
        corrected,
        mixer,
        camera,
        rate,
        rawSpeed,
        lengthOfShot,
      })
    }
    window.dinoComparison = {
      species: models.map(({ name, lengthOfShot }) => ({ name, lengthOfShot })),
      frame(index, mode, time) {
        const model = models[index]
        for (const { raw, previous, corrected } of models)
          raw.root.visible =
            previous.root.visible =
            corrected.root.visible =
              false
        const animal = model[mode]
        animal.start(new T.Vector3(), 0)
        if (mode === 'raw') {
          model.mixer.setTime(time * model.rate)
          animal.root.position.z = model.rawSpeed * time
        } else {
          for (let t = 0; t < time - 1e-8; t += 1 / 120)
            animal.update(Math.min(1 / 120, time - t))
        }
        renderer.render(scene, model.camera)
        return renderer.domElement.toDataURL('image/png').split(',')[1]
      },
    }
  })
  const info = await page.evaluate(() => window.dinoComparison.species)
  await fs.mkdir(`${out}/compare-frames`, { recursive: true })
  for (const [index, { name, lengthOfShot }] of info.entries()) {
    const every = quick ? 7 : 1
    for (let i = 0; i <= Math.round(lengthOfShot * 12); i += every) {
      for (const mode of ['raw', 'previous', 'corrected']) {
        const png = await page.evaluate(
          ([index, mode, time]) =>
            window.dinoComparison.frame(index, mode, time),
          [index, mode, i / 12],
        )
        await fs.writeFile(
          `${out}/compare-frames/${name}-${mode}-${String(i).padStart(3, '0')}.png`,
          Buffer.from(png, 'base64'),
        )
      }
    }
    console.log(name, lengthOfShot)
  }
} finally {
  await browser.close()
}
