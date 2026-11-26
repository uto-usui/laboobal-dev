import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { loop, onResize } from '../../shared/dom'
import { createGlStage } from '../../shared/gl'
import { clamp, damp, random, toRadian } from '../../shared/math'
import { onReducedMotion } from '../../shared/motion'
import { trackPointer } from '../../shared/pointer'
import {
  cameraInput,
  DEFAULT_ANGLE,
  MAX_ANGLE,
  MIN_ANGLE,
} from './camera-input'
import characterUrl from './assets/character.glb?url'
import { createWalker } from './walk'
import { createSavanna } from './savanna'
import { createLoading } from './loading'

const stage = document.querySelector<HTMLElement>('.toy-figure')!
const canvas = stage.querySelector('canvas')!
const renderer = createGlStage(canvas, { antialias: true })

if (renderer)
  void start(renderer).catch((error: unknown) => {
    console.error(error)
    stage.setAttribute('aria-busy', 'false')
    const panel = stage.querySelector('.loading')!
    panel.setAttribute('role', 'alert')
    panel.textContent =
      'キャラを読み込めませんでした。ページを開き直してください。'
  })

async function start(renderer: THREE.WebGLRenderer) {
  // スマホの DPR 3 でも同じ描画条件を保つ。
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3))
  const params = new URLSearchParams(location.search)
  const requestedAngle = Number(params.get('view'))
  const initialAngle =
    import.meta.env.DEV &&
    requestedAngle >= MIN_ANGLE &&
    requestedAngle <= MAX_ANGLE
      ? requestedAngle
      : DEFAULT_ANGLE
  const inspect = import.meta.env.DEV && params.has('walk-inspect')
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#e4ecf0')
  scene.fog = new THREE.Fog('#e4ecf0', 85, 210)
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap

  const room = new RoomEnvironment()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environment = pmrem.fromScene(room, 0.04)
  scene.environment = environment.texture
  scene.environmentIntensity = 0.65
  room.dispose()
  pmrem.dispose()

  const key = new THREE.DirectionalLight('#fff5e9', 2.5)
  key.position.set(-1.2, 2.5, 3)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.radius = 6
  Object.assign(key.shadow.camera, {
    left: -0.9,
    right: 0.9,
    top: 1.2,
    bottom: -0.8,
    near: 0.1,
    far: 7,
  })
  key.shadow.bias = -0.00015
  key.shadow.normalBias = 0.003
  key.target.position.set(0, 0.5, 0)
  scene.add(key, key.target)
  const fill = new THREE.DirectionalLight('#e5edff', 0.7)
  fill.position.set(2, 1.2, 1)
  scene.add(fill)

  const camera = new THREE.PerspectiveCamera(25, 1, 0.05, 300)
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  performance.mark('toy-figure-load-start')
  const loading = createLoading(stage, loader)
  const [gltf, savanna] = await Promise.all([
    loading.load(characterUrl),
    createSavanna(scene, (url) => loading.load(url), inspect),
  ])
  loading.set(92)
  const character = gltf.scene
  scene.add(character)
  const floorY = 0.06
  character.position.y =
    floorY - new THREE.Box3().setFromObject(character).min.y
  const materials = new Map<string, THREE.MeshStandardMaterial>()
  character.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.castShadow =
      !object.name.startsWith('eye_') && object.name !== 'glasses_lens'
    object.receiveShadow = true
    const material = object.material as THREE.MeshStandardMaterial
    // 生成画像に陰が含まれるため、体と頭へ AO を重ねない。
    if (!material.name.startsWith('eye_')) material.aoMapIntensity = 0
    materials.set(material.name, material)
  })

  const lids = materials.get('eye_lids')!
  const iris = materials.get('eye_iris')!
  const irisMesh = character.getObjectByName('eye_iris')!
  const lens = materials.get('glasses_lens')! as THREE.MeshPhysicalMaterial
  lens.transmission = 1
  lens.opacity = 1
  lens.thickness = 0
  lens.transparent = false
  // 黒目を opaque の段階で描き、後から描く transmission のレンズに含める。
  iris.transparent = false
  iris.alphaTest = 0.5
  iris.polygonOffset = true
  iris.polygonOffsetFactor = -1
  iris.polygonOffsetUnits = -1
  iris.alphaMap = iris.aoMap!.clone()
  // この GLB は開口を ORM の R に保存している。標準 alphaMap の G では読めない。
  iris.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <alphamap_fragment>',
      '#ifdef USE_ALPHAMAP\n diffuseColor.a *= texture2D(alphaMap, vAlphaMapUv).r;\n#endif',
    )
  }
  iris.customProgramCacheKey = () => 'toy-figure-aperture-r'
  iris.needsUpdate = true

  const bounds = new THREE.Box3().setFromObject(character, true)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const groundShadow = new THREE.ShadowMaterial({
    color: '#514753',
    opacity: 0.2,
  })
  groundShadow.onBeforeCompile = (shader) => {
    shader.vertexShader =
      `varying vec2 vGround;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n vGround = position.xy;',
      )
    shader.fragmentShader =
      `varying vec2 vGround;\n${shader.fragmentShader}`.replace(
        '#include <tonemapping_fragment>',
        'gl_FragColor.a *= 1.0 - smoothstep(0.15, 0.55, length(vGround));\n#include <tonemapping_fragment>',
      )
  }
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    groundShadow,
  )
  contactShadow.rotation.x = -Math.PI / 2
  contactShadow.receiveShadow = true
  scene.add(contactShadow)
  const walker = createWalker(character, gltf, floorY, inspect)
  const aim = center.clone()
  let cameraDistance = 1
  let cameraReady = false
  let inspection: { paused: boolean; view: number | null } | undefined
  const corners: THREE.Vector3[] = []
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z])
        corners.push(new THREE.Vector3(x, y, z))
  const elevation = toRadian(5)
  const elevationSin = Math.sin(elevation)
  const elevationCos = Math.cos(elevation)
  const offset = new THREE.Vector3()
  const fitCamera = camera.clone()
  let appliedView = toRadian(initialAngle)
  let stableFor = 0
  const followCamera = (view: number, target = camera) => {
    aim
      .copy(center)
      .add(
        offset.set(
          character.position.x,
          target.aspect < 0.8 ? 0.55 : 0.62,
          character.position.z + 0.24,
        ),
      )
    target.position
      .copy(aim)
      .add(
        offset.set(
          Math.sin(view) * elevationCos * cameraDistance,
          elevationSin * cameraDistance,
          Math.cos(view) * elevationCos * cameraDistance,
        ),
      )
    target.lookAt(aim)
    target.updateMatrixWorld()
  }
  onResize(stage, ({ width, height }) => {
    if (!width || !height) return
    renderer.setSize(width, height, false)
    fitCamera.aspect = width / height
    fitCamera.updateProjectionMatrix()
    savanna.resize(fitCamera.aspect, width)
    const vertical = fitCamera.aspect < 0.8 ? 0.345 : 0.4
    cameraDistance = size.y / (2 * Math.tan(toRadian(12.5)) * vertical)
    const position = character.position.clone()
    character.position.x = character.position.z = 0
    for (let i = 0; i < 8; i++) {
      followCamera(toRadian(DEFAULT_ANGLE), fitCamera)
      const projected = corners.map((point) => point.clone().project(fitCamera))
      const spanY =
        Math.max(...projected.map((p) => p.y)) -
        Math.min(...projected.map((p) => p.y))
      const maxX = Math.max(...projected.map((p) => Math.abs(p.x)))
      cameraDistance *= Math.max(spanY / (vertical * 2), maxX / 0.84)
    }
    character.position.copy(position)
    cameraReady = true
  })

  character.updateMatrixWorld(true)
  // GLTFLoader が記号を除いた名前にするため、元の glTF の node 番号から骨を引く。
  const bone = (name: string) => {
    let found: THREE.Bone | undefined
    character.traverse((object) => {
      const index = gltf.parser.associations.get(object)?.nodes
      if (
        object instanceof THREE.Bone &&
        index !== undefined &&
        gltf.parser.json.nodes[index].name === name
      )
        found = object
    })
    if (!found) throw new Error(`Missing bone: ${name}`)
    const rest = found.quaternion.clone()
    const inverse = found.getWorldQuaternion(new THREE.Quaternion()).invert()
    return {
      object: found,
      rest,
      yaw: new THREE.Vector3(0, 1, 0).applyQuaternion(inverse),
      pitch: new THREE.Vector3(1, 0, 0).applyQuaternion(inverse),
    }
  }
  const head = bone('head')
  const neck = bone('neck')
  const upper = bone('spine.upper')
  const chest = bone('spine.chest')
  const turn = (part: typeof head, yaw: number, pitch = 0) => {
    part.object.quaternion
      .copy(part.rest)
      .multiply(new THREE.Quaternion().setFromAxisAngle(part.yaw, yaw))
      .multiply(new THREE.Quaternion().setFromAxisAngle(part.pitch, pitch))
  }
  const pointer = trackPointer(stage, {
    units: 'unit',
    touch: 'ignore',
    leave: 'center',
  })
  let reduced = false
  let blinkAt = random(3, 6)
  let time = 0
  let gazeX = 0
  let gazeY = 0
  let headX = 0
  let headY = 0
  let bodyX = 0
  onReducedMotion((value) => {
    reduced = value
    walker.setReduced(value)
    blinkAt = random(3, 6)
  })
  let lastFrame = -1
  const setFrame = (frame: number) => {
    if (frame === lastFrame) return
    lids.map!.offset.x = frame / 3
    iris.alphaMap!.offset.x = frame / 3
    irisMesh.visible = frame !== 2
    lastFrame = frame
  }
  const raycaster = new THREE.Raycaster()
  const hitPoint = new THREE.Vector2()
  let lookPoint: THREE.Vector3 | undefined
  let lookAnimal: THREE.Object3D | undefined
  let lookTime = 0
  const input = cameraInput(canvas, initialAngle, (x, y) => {
    raycaster.setFromCamera(hitPoint.set(x, y), camera)
    const hits = raycaster.intersectObjects(
      savanna.animalRoots.filter((o) => o.visible),
      true,
    )
    const animal = hits[0]
      ? savanna.animalRoots.find((root) => {
          let object: THREE.Object3D | null = hits[0].object
          while (object) {
            if (object === root) return true
            object = object.parent
          }
          return false
        })
      : undefined
    lookAnimal = animal
    lookPoint = animal ? undefined : new THREE.Vector3(x, y, 0)
    lookTime = 2.2
    walker.look()
  })
  let origin = 0
  let frames = 0
  let metrics = false
  const measurements = {
    kneeMin: Infinity,
    kneeMax: -Infinity,
    supportKneeMax: 0,
    slipMaxMm: 0,
    patchSlipMaxMm: 0,
    thighMax: 0,
    armMax: 0,
    visibleObjectsMin: Infinity,
    visibleObjectsMax: 0,
    sparseFrames: 0,
    crowdedFrames: 0,
    midSwingMinMm: Infinity,
    midSwingMaxMm: 0,
    thighForwardMax: 0,
    thighBackwardMax: 0,
    soleHeightMaxMm: 0,
    soleHeightMinMm: Infinity,
    treeCounts: [] as number[],
    objectCounts: [] as number[],
    mediumTreeFrames: 0,
    foregroundGrassWidths: [] as number[],
    cameraDeltas: [] as number[],
    frameTimes: [] as number[],
    cameraSpeeds: [] as number[],
    cameraJumps: 0,
    maxTrackingStep: 0,
    boundaries: [] as {
      step: boolean
      exchange: boolean
      rebase: boolean
      delta: number
      speed: number
    }[],
    frames: 0,
  }
  let previousStep = 0
  let previousExchange = 0
  let previousOrigin = 0
  let previousCamera: THREE.Vector3 | undefined
  let previousAim: THREE.Vector3 | undefined
  const draw = (dt: number, _elapsed: number, render = true) => {
    // ResizeObserver が画角を合わせる前の一枚を出さない。
    if (!cameraReady) return
    walker.update(dt)
    if (character.position.z >= 16) {
      walker.rebase(16)
      savanna.rebase(16)
      origin += 16
    }
    const view = inspection?.view ?? toRadian(input.angle)
    stableFor = view === appliedView ? stableFor + dt : 0
    appliedView = view
    if (camera.aspect !== fitCamera.aspect) {
      camera.aspect = fitCamera.aspect
      camera.updateProjectionMatrix()
    }
    followCamera(view)
    savanna.update(
      dt,
      character.position,
      reduced,
      camera,
      view,
      cameraDistance,
      stableFor,
    )
    stage.dataset.walking = walker.active ? 'auto' : 'idle'
    stage.dataset.walkState = walker.state
    let target = pointer.inside && !input.dragging ? pointer : { x: 0, y: 0 }
    if (lookTime > 0) {
      lookTime -= dt
      const projected = lookAnimal?.visible
        ? lookAnimal
            .getWorldPosition(new THREE.Vector3())
            .add(new THREE.Vector3(0, 0.3, 0))
            .project(camera)
        : lookPoint
      if (projected) target = { x: projected.x, y: -projected.y }
    }
    const x = clamp(target.x, -1, 1)
    const y = clamp(target.y, -1, 1)
    gazeX = damp(gazeX, x, 12, dt)
    gazeY = damp(gazeY, y, 12, dt)
    headX = damp(headX, x, 6, dt)
    headY = damp(headY, y, 6, dt)
    bodyX = damp(bodyX, x, 3, dt)
    // camera UV の上下と glTF の画像 UV の上下は逆。サンプル位置は視線と逆へ動かす。
    iris.map!.offset.set((-gazeX * 18) / 1024, (gazeY * -10) / 1024)
    const yaw = toRadian(9) * headX
    const pitch = toRadian(5) * headY
    turn(neck, yaw * 0.35, pitch * 0.35)
    turn(head, yaw * 0.65, pitch * 0.65)
    const breath = reduced ? 0 : Math.sin((time * Math.PI) / 2) * toRadian(0.35)
    turn(upper, toRadian(2) * bodyX)
    turn(chest, toRadian(2) * bodyX, breath)
    if (!reduced) time += dt
    const sinceBlink = time - blinkAt
    if (sinceBlink >= 0.15) {
      blinkAt += random(3, 6)
      setFrame(0)
    } else
      setFrame(
        reduced || sinceBlink < 0
          ? 0
          : sinceBlink < 0.045 || sinceBlink >= 0.105
            ? 1
            : 2,
      )
    contactShadow.position.set(
      character.position.x,
      floorY + 0.0001,
      character.position.z,
    )
    key.position.set(character.position.x - 1.2, 2.5, character.position.z + 3)
    key.target.position.set(character.position.x, 0.5, character.position.z)
    fill.position.set(character.position.x + 2, 1.2, character.position.z + 1)
    if (inspect) frames++
    if (inspect && metrics) {
      const sample = walker.inspect()
      measurements.frames++
      const treeFrame = savanna.inspect()
      measurements.treeCounts.push(treeFrame.visibleTrees)
      measurements.objectCounts.push(treeFrame.visibleObjects)
      measurements.foregroundGrassWidths.push(...treeFrame.grassWidths)
      if (treeFrame.mediumTrees) measurements.mediumTreeFrames++
      const counters = savanna.counters
      measurements.visibleObjectsMin = Math.min(
        measurements.visibleObjectsMin,
        counters.visibleObjects,
      )
      measurements.visibleObjectsMax = Math.max(
        measurements.visibleObjectsMax,
        counters.visibleObjects,
      )
      if (counters.visibleObjects < (camera.aspect < 0.8 ? 5 : 8))
        measurements.sparseFrames++
      if (counters.visibleObjects > (camera.aspect < 0.8 ? 10 : 15))
        measurements.crowdedFrames++
      if (
        sample.state === 'walk' &&
        sample.phase >= 0.45 &&
        sample.phase <= 0.55
      ) {
        measurements.midSwingMinMm = Math.min(
          measurements.midSwingMinMm,
          sample.feet[1 - sample.support].height,
        )
        measurements.midSwingMaxMm = Math.max(
          measurements.midSwingMaxMm,
          sample.feet[1 - sample.support].height,
        )
      }
      measurements.kneeMin = Math.min(measurements.kneeMin, ...sample.knees)
      measurements.kneeMax = Math.max(measurements.kneeMax, ...sample.knees)
      measurements.supportKneeMax = Math.max(
        measurements.supportKneeMax,
        sample.knees[sample.support],
      )
      measurements.slipMaxMm = Math.max(
        measurements.slipMaxMm,
        sample.feet[sample.support].slip,
      )
      measurements.patchSlipMaxMm = Math.max(
        measurements.patchSlipMaxMm,
        sample.feet[sample.support].nearContactDeformation,
      )
      measurements.thighMax = Math.max(
        measurements.thighMax,
        ...sample.feet.map((f) => f.thigh),
      )
      measurements.thighForwardMax = Math.max(
        measurements.thighForwardMax,
        ...sample.feet.map((f) => -f.thighPitch),
      )
      measurements.thighBackwardMax = Math.max(
        measurements.thighBackwardMax,
        ...sample.feet.map((f) => f.thighPitch),
      )
      measurements.soleHeightMaxMm = Math.max(
        measurements.soleHeightMaxMm,
        ...sample.feet.map((f) => f.height),
      )
      measurements.soleHeightMinMm = Math.min(
        measurements.soleHeightMinMm,
        ...sample.feet.map((f) => f.height),
      )
      measurements.armMax = Math.max(measurements.armMax, ...sample.arms)
      const absolute = camera.position
        .clone()
        .add(new THREE.Vector3(0, 0, origin))
      if (previousCamera && dt > 0) {
        const delta = absolute.distanceTo(previousCamera)
        const speed = delta / dt
        measurements.cameraDeltas.push(delta)
        measurements.frameTimes.push(dt)
        measurements.cameraSpeeds.push(speed)
        const exchange = counters.exchanges
        if (
          sample.stepCount !== previousStep ||
          exchange !== previousExchange ||
          origin !== previousOrigin
        )
          measurements.boundaries.push({
            step: sample.stepCount !== previousStep,
            exchange: exchange !== previousExchange,
            rebase: origin !== previousOrigin,
            delta,
            speed,
          })
        previousStep = sample.stepCount
        previousExchange = exchange
        previousOrigin = origin
      }
      const absoluteAim = aim.clone().add(new THREE.Vector3(0, 0, origin))
      if (previousAim && dt > 0) {
        const step = absoluteAim.distanceTo(previousAim)
        measurements.maxTrackingStep = Math.max(
          measurements.maxTrackingStep,
          step,
        )
        // カメラの意図した回転を除いて、歩幅を超える移動だけ数える。
        if (step > 0.14) measurements.cameraJumps++
      }
      previousAim = absoluteAim
      previousCamera = absolute
    }
    if (render) {
      renderer.render(scene, camera)
      input.didRender()
      const degrees = String(Number(THREE.MathUtils.radToDeg(view).toFixed(3)))
      if (stage.dataset.cameraAngle !== degrees)
        stage.dataset.cameraAngle = degrees
    }
    if (stage.getAttribute('aria-busy') === 'true') {
      performance.mark('toy-figure-first-frame')
      performance.measure(
        'toy-figure-load',
        'toy-figure-load-start',
        'toy-figure-first-frame',
      )
      if (render) {
        canvas.tabIndex = 0
        loading.complete()
      }
    }
  }
  loading.set(95)
  await renderer.compileAsync(scene, camera)
  loading.set(99)
  loop((dt, elapsed) => {
    if (!inspection?.paused) draw(dt, elapsed)
  })
  if (inspect) {
    inspection = { paused: false, view: null }
    const controls = inspection
    Object.assign(window, {
      __toyWalk: {
        controls,
        floorY: floorY,
        snapshot: () => ({
          ...walker.inspect(),
          distance: walker.distance,
          origin,
          frames,
          reduced,
          appliedView,
          stableFor,
          scenery: savanna.inspect(),
          gaze: [gazeX, gazeY],
          lookTime,
          lookTarget: lookAnimal
            ? savanna.animalRoots.indexOf(lookAnimal as THREE.Group)
            : null,
        }),
        beginMetrics: () => {
          metrics = true
          savanna.beginMetrics()
          previousCamera = undefined
          previousAim = undefined
        },
        metrics: () => ({
          ...measurements,
          scenery: savanna.inspect(),
          projections: savanna.projectionMetrics(),
        }),
        advance: (dt: number, render = true) => draw(dt, time + dt, render),
        project: (x: number, z: number) => {
          const p = new THREE.Vector3(x, floorY, z).project(camera)
          const rect = canvas.getBoundingClientRect()
          return {
            x: rect.left + ((p.x + 1) * rect.width) / 2,
            y: rect.top + ((1 - p.y) * rect.height) / 2,
          }
        },
        sceneFrame: () =>
          savanna.view(
            camera,
            head.object.getWorldPosition(new THREE.Vector3()),
            bounds,
          ),
        framing: () => {
          const frame = {
            minX: Infinity,
            maxX: -Infinity,
            minY: Infinity,
            maxY: -Infinity,
          }
          const p = new THREE.Vector3()
          character.updateMatrixWorld(true)
          character.traverse((object) => {
            if (!(object instanceof THREE.Mesh) || !object.visible) return
            for (
              let i = 0;
              i < object.geometry.getAttribute('position').count;
              i++
            ) {
              object.getVertexPosition(i, p)
              p.applyMatrix4(object.matrixWorld).project(camera)
              frame.minX = Math.min(frame.minX, p.x)
              frame.maxX = Math.max(frame.maxX, p.x)
              frame.minY = Math.min(frame.minY, p.y)
              frame.maxY = Math.max(frame.maxY, p.y)
            }
          })
          return frame
        },
        objects: () => ({ scene, camera }),
        scaleLineup: () => {
          controls.paused = true
          savanna.scaleLineup()
          character.position.set(-42, character.position.y, 0)
          contactShadow.position.x = -42
          contactShadow.position.z = 0
          scene.fog = null
          const comparison = new THREE.PerspectiveCamera(
            25,
            camera.aspect,
            0.1,
            300,
          )
          comparison.position.set(-6, 13, 67)
          comparison.lookAt(-6, 2.5, 0)
          renderer.render(scene, comparison)
          return savanna.inspect().animals
        },
        camera: () => camera.position.toArray(),
        renderer: renderer
          .getContext()
          .getParameter(renderer.getContext().RENDERER),
      },
    })
  }
}
