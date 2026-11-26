import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createDinosaur } from './dinosaurs'
import { skinnedPositions } from './skinned-positions'
import trexUrl from './assets/Trex.glb?url'
import raptorUrl from './assets/Velociraptor.glb?url'
import triceratopsUrl from './assets/Triceratops-balanced.glb?url'
import paraUrl from './assets/Parasaurolophus.glb?url'
import stegoUrl from './assets/Stegosaurus-balanced.glb?url'
import apatoUrl from './assets/Apatosaurus-balanced.glb?url'
import palmUrl from './assets/PalmTree_1.glb?url'
import palm3Url from './assets/PalmTree_3.glb?url'
import fernUrl from './assets/Fern_1.glb?url'
import grassUrl from './assets/Grass_Common_Short.glb?url'
import rockUrl from './assets/Rock_Medium_1.glb?url'
import bushUrl from './assets/Bush_Common.glb?url'
import wispyUrl from './assets/Grass_Wispy_Short.glb?url'
import tallUrl from './assets/Grass_Common_Tall.glb?url'
import rock2Url from './assets/Rock_Medium_2.glb?url'
import pebbleUrl from './assets/Pebble_Round_2.glb?url'

const FLOOR = 0.06
const LENGTH = 10
const BACK = 150
const FRONT = 20
const FOG_FAR = 210
const HALF_FOV_TAN = Math.tan(THREE.MathUtils.degToRad(12.5))
const PASS_LIMIT = [65, 35, 75, 75, 85, 105]

type Rect = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  depth: number
  farthest: number
}
const projectedBox = (box: THREE.Box3, camera: THREE.Camera): Rect => {
  const r = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    depth: Infinity,
    farthest: -Infinity,
  }
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(x, y, z)
        p.applyMatrix4(camera.matrixWorldInverse)
        r.depth = Math.min(r.depth, -p.z)
        r.farthest = Math.max(r.farthest, -p.z)
        p.applyMatrix4(camera.projectionMatrix)
        r.minX = Math.min(r.minX, p.x)
        r.maxX = Math.max(r.maxX, p.x)
        r.minY = Math.min(r.minY, p.y)
        r.maxY = Math.max(r.maxY, p.y)
      }
  return r
}
const modelProjector = (model: THREE.Object3D) => {
  const meshes: {
    count: number
    update: () => void
    world: (i: number, target: THREE.Vector3) => THREE.Vector3
  }[] = []
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    const count = o.geometry.getAttribute('position').count
    if (o instanceof THREE.SkinnedMesh)
      meshes.push({ count, ...skinnedPositions(o) })
    else
      meshes.push({
        count,
        update() {},
        world: (i, target) =>
          o.getVertexPosition(i, target).applyMatrix4(o.matrixWorld),
      })
  })
  const p = new THREE.Vector3()
  const makeRect = (): Rect => ({
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    depth: Infinity,
    farthest: -Infinity,
  })
  const projection = new THREE.Matrix4()
  const referenceProjection = new THREE.Matrix4()
  const add = (r: Rect, m: THREE.Matrix4) => {
    const e = m.elements
    const w = e[3] * p.x + e[7] * p.y + e[11] * p.z + e[15]
    const x = (e[0] * p.x + e[4] * p.y + e[8] * p.z + e[12]) / w
    const y = (e[1] * p.x + e[5] * p.y + e[9] * p.z + e[13]) / w
    r.depth = Math.min(r.depth, w)
    r.farthest = Math.max(r.farthest, w)
    r.minX = Math.min(r.minX, x)
    r.maxX = Math.max(r.maxX, x)
    r.minY = Math.min(r.minY, y)
    r.maxY = Math.max(r.maxY, y)
  }
  return (camera: THREE.Camera, reference?: THREE.Camera) => {
    const current = makeRect()
    const original = reference ? makeRect() : current
    projection.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    )
    if (reference)
      referenceProjection.multiplyMatrices(
        reference.projectionMatrix,
        reference.matrixWorldInverse,
      )
    for (const mesh of meshes) {
      mesh.update()
      for (let i = 0; i < mesh.count; i++) {
        mesh.world(i, p)
        add(current, projection)
        if (reference) add(original, referenceProjection)
      }
    }
    return { current, original }
  }
}

const inView = (r: Rect, far = 180) =>
  r.depth > 0 &&
  r.depth < far &&
  r.minX < 1 &&
  r.maxX > -1 &&
  r.minY < 1 &&
  r.maxY > -1
const canBeSeen = (r: Rect) =>
  r.farthest >= 0.05 &&
  r.depth < FOG_FAR &&
  (r.depth < 0.05 || inView(r, FOG_FAR))
const gap = (a: Rect, b: Rect) =>
  Math.max(a.minX - b.maxX, b.minX - a.maxX, a.minY - b.maxY, b.minY - a.maxY)

export async function createSavanna(
  scene: THREE.Scene,
  load: (url: string) => Promise<GLTF>,
  inspect: boolean,
) {
  const loaded = await Promise.all(
    [
      trexUrl,
      raptorUrl,
      triceratopsUrl,
      paraUrl,
      stegoUrl,
      apatoUrl,
      palmUrl,
      palm3Url,
      fernUrl,
      grassUrl,
      rockUrl,
      bushUrl,
      wispyUrl,
      tallUrl,
      rock2Url,
      pebbleUrl,
    ].map(load),
  )
  loaded.forEach((g) =>
    g.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = false
        o.receiveShadow = false
      }
    }),
  )
  const terrain = document.createElement('canvas')
  terrain.width = terrain.height = 512
  const paint = terrain.getContext('2d')!
  paint.fillStyle = '#939e82'
  paint.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 36; i++) {
    const x = (i * 157.7) % 512,
      y = (i * 293.3) % 512
    const radius = 55 + (i % 5) * 18
    for (const dx of [-512, 0, 512])
      for (const dy of [-512, 0, 512]) {
        const g = paint.createRadialGradient(
          x + dx,
          y + dy,
          0,
          x + dx,
          y + dy,
          radius,
        )
        g.addColorStop(0, ['#80906b99', '#b8a67baa', '#c6b48299'][i % 3])
        g.addColorStop(1, '#939e8200')
        paint.fillStyle = g
        paint.fillRect(0, 0, 512, 512)
      }
  }
  paint.strokeStyle = '#a8916b55'
  paint.lineWidth = 6
  paint.beginPath()
  paint.moveTo(65, 0)
  paint.bezierCurveTo(140, 180, 10, 330, 65, 512)
  paint.stroke()
  const groundTexture = new THREE.CanvasTexture(terrain)
  groundTexture.colorSpace = THREE.SRGBColorSpace
  groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping
  groundTexture.repeat.set(600 / 24, 600 / 24)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 0.96 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = FLOOR - 0.0002
  scene.add(ground)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(43,49,30,.22)')
  gradient.addColorStop(1, 'rgba(43,49,30,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    depthWrite: false,
  })
  const plane = new THREE.PlaneGeometry(1, 1)
  const contact = (width: number, depth: number) => {
    const p = new THREE.Mesh(plane, shadowMaterial)
    p.rotation.x = -Math.PI / 2
    p.scale.set(width, depth, 1)
    p.position.y = FLOOR + 0.0001
    return p
  }
  const prototypes = loaded.slice(6).map((g, i) => {
    const o = g.scene
    const box = new THREE.Box3().setFromObject(o)
    const h = [7, 8.5, 0.8, 0.32, 0.35, 0.9, 0.3, 0.4, 0.55, 0.14][i]
    o.scale.multiplyScalar(h / box.getSize(new THREE.Vector3()).y)
    const b = new THREE.Box3().setFromObject(o)
    o.position.y -= b.min.y
    return o
  })
  let seed = 0x971ba5
  const random = () => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return (seed >>> 0) / 4294967296
  }
  let offset = 0,
    sequence = 0,
    lastLayout = -1,
    exchanges = 0,
    repeats = 0,
    rebases = 0
  let aspect = 1,
    width = 1
  const history: number[] = []
  const segments: {
    group: THREE.Group
    index: number
    layout: number
    maxZ: number
    props: {
      object: THREE.Object3D
      box: THREE.Box3
      tree: boolean
      grass: boolean
    }[]
  }[] = []
  const pool: (typeof segments)[number][] = []
  let nextExchange = 0
  const clear = (s: (typeof segments)[number]) => {
    s.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry !== plane) {
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        mats.forEach((m) => m.dispose())
      }
    })
    s.group.clear()
    s.props.length = 0
  }
  const populate = (s: (typeof segments)[number], index: number) => {
    const layout = (lastLayout + 1 + Math.floor(random() * 5)) % 6
    if (inspect && layout === lastLayout) repeats++
    lastLayout = s.layout = layout
    s.index = index
    s.maxZ = LENGTH
    if (inspect) {
      history.push(layout)
      if (history.length > 64) history.shift()
    }
    s.group.position.z = index * LENGTH - offset
    const add = (id: number, x: number, z: number, dry = false) => {
      const object = prototypes[id].clone(true)
      const variation = [3, 6, 7].includes(id)
        ? 0.7 + random() * 0.55
        : 0.6 + random() * 0.9
      object.scale.multiplyScalar(
        id < 2
          ? 0.9 + random() * 0.2
          : id === 4
            ? 0.4 + random() * 0.3
            : variation,
      )
      if (id === 2 && x > 0) {
        const h = new THREE.Box3()
          .setFromObject(object)
          .getSize(new THREE.Vector3()).y
        object.scale.multiplyScalar(0.46 / h)
      }
      object.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return
        const source = Array.isArray(o.material) ? o.material : [o.material]
        const shade = 0.92 + random() * 0.16
        const mats = source.map((m) => {
          const material = m.clone() as THREE.MeshStandardMaterial
          material.color.multiplyScalar(shade)
          if (dry) material.color.set('#b7a16b').multiplyScalar(shade)
          return material
        })
        o.material = Array.isArray(o.material) ? mats : mats[0]
      })
      object.rotation.y = random() * Math.PI * 2
      object.position.x = x
      object.position.z = z
      object.position.y += FLOOR
      const box = new THREE.Box3().setFromObject(object)
      const size = box.getSize(new THREE.Vector3())
      const shade = contact(size.x * 0.9, size.z * 0.8)
      shade.position.x = x
      shade.position.z = z
      s.group.add(object, shade)
      s.maxZ = Math.max(s.maxZ, box.max.z, z + shade.scale.y / 2)
      s.props.push({
        object,
        box,
        tree: id < 2,
        grass: [2, 3, 5, 6, 7].includes(id),
      })
    }
    // 頭の投影位置より高く通る距離帯と、腰より低く通る手前の帯を分ける。
    if (index % 4 === 0) add(layout % 2, -52, 0.3)
    if (index % 8 === 0) add(layout % 2, -36, 6)
    if (index % 3 === 0) add([2, 5, 8][layout % 3], -20, 3)
    if (index % 2 === 0) add(2, 4.4, 7)
    if (aspect >= 0.8 && index % 3 === 0) {
      add([5, 8, 6][layout % 3], -27, 5, layout % 3 === 2)
    }
    if (aspect < 0.8) {
      add(5, -12, 2)
      add(8, -12, 7)
    }
    const n = aspect < 0.8 ? 8 : 3
    for (let j = 0; j < n; j++) {
      const id = [3, 6, 7, 9][(layout + j) % 4]
      const lane = id === 9 ? 1.6 : id === 7 ? 1.85 : id === 6 ? 1.55 : 1.05
      add(
        id,
        lane + random() * 0.12,
        ((j + 0.3) * LENGTH) / n,
        id !== 9 && index % 4 < 2,
      )
    }
  }
  const appendSegment = (index: number) => {
    const s = pool.pop() ?? {
      group: new THREE.Group(),
      index,
      layout: 0,
      maxZ: LENGTH,
      props: [],
    }
    populate(s, index)
    scene.add(s.group)
    segments.push(s)
    return s
  }
  const discardSegment = (s: (typeof segments)[number]) => {
    scene.remove(s.group)
    clear(s)
    pool.push(s)
  }
  const rebuild = () => {
    for (const s of segments) discardSegment(s)
    segments.length = 0
    nextExchange = Math.floor(offset / LENGTH) - Math.ceil(BACK / LENGTH)
    sequence = nextExchange
    const last = nextExchange + Math.ceil((BACK + FRONT) / LENGTH)
    while (sequence <= last) appendSegment(sequence++)
  }
  rebuild()
  const species = [
    'T-Rex',
    'Velociraptor',
    'Triceratops',
    'Parasaurolophus',
    'Stegosaurus',
    'Apatosaurus',
  ]
  const animals = loaded.slice(0, 6).map((g, i) => {
    const a = createDinosaur(
      g,
      species[i],
      [12, 2, 8.5, 9.5, 8.5, 22][i],
      inspect,
    )
    const b = new THREE.Box3()
      .setFromObject(a.model, true)
      .getSize(new THREE.Vector3())
    a.root.add(contact(b.x, b.z * 0.85))
    a.root.visible = false
    scene.add(a.root)
    return Object.assign(a, { project: modelProjector(a.model) })
  })
  let measuring = false
  const projectionMetrics = animals.map((a) => ({
    species: a.species,
    visibleFrames: 0,
    fullFrames: 0,
    fullSeconds: 0,
    longestFullSeconds: 0,
    horizontallyFullFrames: 0,
    topClippedFrames: 0,
    heightRatios: [] as number[],
    screenHeights: [] as number[],
    depths: [] as number[],
  }))
  const passage = animals.map(() => ({
    camera: new THREE.PerspectiveCamera(),
    angle: 0,
    distance: 0,
    x: 0,
    y: 0,
    z: 0,
    age: 0,
    entered: false,
    retireReason: undefined as 'passed' | 'missed' | undefined,
  }))
  let wait = 3,
    next = 0,
    appearances = 0,
    lastSpecies = '',
    elapsed = 0
  const appearanceLog: { time: number; species: string }[] = []
  const entrances: {
    time: number
    species: string
    angle: number
    stableFor: number
    visible: boolean
  }[] = []
  const departures: {
    time: number
    species: string
    reason: string
    visible: boolean
  }[] = []
  let foregroundOcclusionFrames = 0
  let visibleExchangeFrames = 0
  const visibleAppearanceLog: { time: number; species: string }[] = []
  let visibleObjects = 0,
    visibleTrees = 0,
    silhouetteOverlaps = 0,
    overlapFrames = 0
  let treeBounds: Rect[] = [],
    animalRects: (Rect & { species: number })[] = [],
    characterRect: Rect
  const overlapLog: unknown[] = []
  let grassWidths: number[] = []
  let overlappingProps: { name: string; x: number; z: number; rect: Rect }[] =
    []
  const updateVisibility = (
    camera: THREE.PerspectiveCamera,
    position: THREE.Vector3,
    view: number,
    distance: number,
    dt: number,
  ) => {
    let foregroundOccluded = false
    let body: Rect[] = []
    let wholeCharacter: Rect | undefined
    if (inspect) {
      body = [
        new THREE.Box3(
          new THREE.Vector3(-0.185, 0.69, -0.16),
          new THREE.Vector3(0.185, 1.07, 0.15),
        ),
        new THREE.Box3(
          new THREE.Vector3(-0.235, 0.35, -0.14),
          new THREE.Vector3(0.235, 0.72, 0.16),
        ),
      ].map((b) =>
        projectedBox(
          b.translate(new THREE.Vector3(position.x, 0, position.z)),
          camera,
        ),
      )
      characterRect = body.reduce((a, b) => ({
        minX: Math.min(a.minX, b.minX),
        maxX: Math.max(a.maxX, b.maxX),
        minY: Math.min(a.minY, b.minY),
        maxY: Math.max(a.maxY, b.maxY),
        depth: Math.min(a.depth, b.depth),
        farthest: Math.max(a.farthest, b.farthest),
      }))
      visibleObjects = visibleTrees = silhouetteOverlaps = 0
      treeBounds = []
      grassWidths = []
      overlappingProps = []
      for (const s of segments)
        for (const p of s.props) {
          const r = projectedBox(
            p.box.clone().translate(s.group.position),
            camera,
          )
          if (
            body.some((b) => r.depth > 0 && r.depth < b.depth && gap(r, b) < 0)
          )
            foregroundOccluded = true
          if (!inView(r)) continue
          visibleObjects++
          if (p.tree) {
            visibleTrees++
            treeBounds.push(r)
          }
          if (body.some((b) => gap(r, b) < 0.015)) {
            silhouetteOverlaps++
            overlappingProps.push({
              name: p.object.children[0]?.name ?? p.object.name,
              x: p.object.position.x,
              z: p.object.position.z + s.group.position.z - position.z,
              rect: r,
            })
          }
          if (
            p.grass &&
            r.maxY < body[1].minY &&
            r.minX > -1 &&
            r.maxX < 1 &&
            r.minY > -1
          )
            grassWidths.push(((r.maxX - r.minX) * width) / 2)
        }
      if (measuring) {
        wholeCharacter = projectedBox(
          new THREE.Box3(
            new THREE.Vector3(-0.235, FLOOR, -0.16),
            new THREE.Vector3(0.235, 1.07, 0.15),
          ).translate(new THREE.Vector3(position.x, 0, position.z)),
          camera,
        )
      }
    }
    animalRects = animals.flatMap((a, i) => {
      if (!a.active) return []
      a.root.updateMatrixWorld(true)
      const p = passage[i]
      const sameView =
        p.angle === view &&
        p.distance === distance &&
        p.camera.aspect === camera.aspect
      const reference =
        p.retireReason || p.age === 0 || sameView ? undefined : p.camera
      if (reference) {
        reference.position.set(
          p.x + position.x,
          p.y + position.y,
          p.z + position.z,
        )
        reference.updateMatrixWorld()
      }
      const { current: r, original } = a.project(camera, reference)
      if (inView(original)) p.entered = true
      if (!p.retireReason) {
        if (
          p.entered &&
          (original.minX > 1.15 ||
            original.maxX < -1.15 ||
            original.depth < 5 ||
            original.depth > 180)
        )
          p.retireReason = 'passed'
        else if (!p.entered && p.age >= PASS_LIMIT[i]) p.retireReason = 'missed'
      }
      if (p.retireReason && !canBeSeen(r)) {
        if (inspect)
          departures.push({
            time: elapsed,
            species: a.species,
            reason: p.retireReason,
            visible: false,
          })
        a.retire()
        projectionMetrics[i].fullSeconds = 0
        return []
      }
      const visible = inView(r)
      if (wholeCharacter) {
        const m = projectionMetrics[i]
        const full =
          visible && r.minX >= -1 && r.maxX <= 1 && r.minY >= -1 && r.maxY <= 1
        m.fullSeconds = full ? m.fullSeconds + dt : 0
        m.longestFullSeconds = Math.max(m.longestFullSeconds, m.fullSeconds)
        if (full) m.fullFrames++
        if (visible) {
          m.visibleFrames++
          if (r.minX >= -1 && r.maxX <= 1) {
            m.horizontallyFullFrames++
            if (r.maxY > 1) m.topClippedFrames++
          }
          m.heightRatios.push(
            (r.maxY - r.minY) / (wholeCharacter.maxY - wholeCharacter.minY),
          )
          m.screenHeights.push((r.maxY - r.minY) / 2)
          m.depths.push(r.depth)
        }
      }
      if (visible) {
        if (body.some((b) => r.depth < b.depth && gap(r, b) < 0))
          foregroundOccluded = true
        if (inspect && !a.root.userData.entered) {
          visibleAppearanceLog.push({ time: elapsed, species: a.species })
          if (visibleAppearanceLog.length > 64) visibleAppearanceLog.shift()
        }
        a.root.userData.entered = true
        if (inspect) {
          visibleObjects++
          if (body.some((b) => gap(r, b) < 0.015)) silhouetteOverlaps++
        }
      }
      return [{ ...r, species: i }]
    })
    if (foregroundOccluded) foregroundOcclusionFrames++
    if (silhouetteOverlaps) {
      overlapFrames++
      if (overlapLog.length < 8)
        overlapLog.push({
          elapsed,
          props: overlappingProps.map((p) => ({ ...p })),
          animals: animalRects.map((r) => ({ ...r })),
          body,
        })
    }
  }
  return {
    ground,
    projectionMetrics: () => projectionMetrics,
    beginMetrics() {
      measuring = true
    },
    scaleLineup() {
      segments.forEach((s) => {
        s.group.visible = false
      })
      let edge = -38
      for (const a of animals) {
        const half = a.inspect().length / 2
        a.start(new THREE.Vector3(edge + half, 0, 0), Math.PI / 2)
        edge += half * 2 + 2
      }
      const group = new THREE.Group()
      prototypes.forEach((p, i) => {
        const o = p.clone(true)
        o.position.add(
          new THREE.Vector3(i < 2 ? -40 + i * 4 : -24 + i * 5, FLOOR, 8),
        )
        group.add(o)
      })
      scene.add(group)
    },
    animalRoots: animals.map((a) => a.root),
    resize(value: number, viewWidth: number) {
      const narrow = aspect < 0.8
      aspect = value
      width = viewWidth
      if (narrow !== aspect < 0.8) rebuild()
    },
    get counters() {
      return {
        exchanges,
        visibleObjects,
        silhouetteOverlaps,
        animalOcclusions: 0,
      }
    },
    update(
      dt: number,
      position: THREE.Vector3,
      reduced: boolean,
      camera: THREE.PerspectiveCamera,
      view: number,
      cameraDistance: number,
      stableFor: number,
    ) {
      const absolute = position.z + offset
      const segmentVisible = (s: (typeof segments)[number]) =>
        s.props.some(({ box }) =>
          inView(
            projectedBox(box.clone().translate(s.group.position), camera),
            FOG_FAR,
          ),
        )
      let visibleExchange = false
      while ((nextExchange + 1) * LENGTH < absolute - BACK) {
        const added = appendSegment(sequence++)
        nextExchange++
        if (inspect) exchanges++
        if (measuring && segmentVisible(added)) visibleExchange = true
      }
      // 画角を振っても、霧に隠れきるまでは後ろの区間を残す。
      const fogBack =
        FOG_FAR * Math.hypot(1, HALF_FOV_TAN, HALF_FOV_TAN * camera.aspect) +
        Math.max(0, position.z - camera.position.z)
      while (
        segments[0].index < nextExchange &&
        segments[0].group.position.z + segments[0].maxZ < position.z - fogBack
      ) {
        const old = segments.shift()!
        if (measuring && segmentVisible(old)) visibleExchange = true
        discardSegment(old)
      }
      if (visibleExchange) visibleExchangeFrames++
      ground.position.z = Math.floor(position.z / LENGTH) * LENGTH
      groundTexture.offset.y = -(ground.position.z + offset) / 24
      if (!reduced) {
        if (inspect) elapsed += dt
        wait = Math.max(-dt, wait - dt)
        if (wait <= 0 && stableFor >= 0.3) {
          const available = animals.findIndex((_animal, i) => {
            const candidate = animals[(next + i) % animals.length]
            return !candidate.active && candidate.species !== lastSpecies
          })
          if (available < 0) wait = 1
          else {
            // 画面に残る大きな個体を置き直さず、まだ歩いていない個体を選ぶ。
            next = (next + available) % animals.length
            const a = animals[next]
            const angle = Math.atan2(
              camera.position.x - position.x,
              camera.position.z - position.z,
            )
            const right = new THREE.Vector3(
              Math.cos(angle),
              0,
              -Math.sin(angle),
            )
            const away = new THREE.Vector3(
              -Math.sin(angle),
              0,
              -Math.cos(angle),
            )
            const narrow = aspect < 0.8
            const side = THREE.MathUtils.smoothstep(
              THREE.MathUtils.radToDeg(view),
              30,
              50,
            )
            const depth =
              (narrow ? [32, 14, 23, 26, 24, 38] : [23, 4, 15, 18, 16, 38])[
                next
              ] + (narrow && next === 5 ? 12 * side : 0)
            const spawnDistance = camera.position.distanceTo(position) + depth
            a.root.updateMatrixWorld(true)
            const length = new THREE.Box3()
              .setFromObject(a.model, true)
              .getSize(new THREE.Vector3()).z
            const edge = spawnDistance * HALF_FOV_TAN * aspect + length * 0.6
            const sign = appearances % 2 === 0 ? 1 : -1
            const start = position
              .clone()
              .addScaledVector(away, depth)
              .addScaledVector(right, -sign * edge)
            start.y = 0
            a.start(
              start,
              Math.atan2(right.x * sign, right.z * sign) +
                (next === 1
                  ? 0
                  : narrow
                    ? sign * (1.15 - (next === 5 ? 0.35 * side : 0))
                    : next === 5
                      ? -sign * 0.55
                      : 0),
              next === 1
                ? {
                    after: narrow ? 0.5 + 0.8 * side : 1,
                    duration: 2.4,
                    angle: sign * Math.PI,
                  }
                : undefined,
            )
            // 尾の長さや向きが違っても、実際の輪郭を画面のすぐ外へ合わせる。
            for (let i = 0; i < 4; i++) {
              a.root.updateMatrixWorld(true)
              const { current: r } = a.project(camera)
              const edge = sign > 0 ? r.maxX : r.minX
              const target = sign > 0 ? -1.015 : 1.015
              a.root.position.addScaledVector(
                right,
                (target - edge) * spawnDistance * HALF_FOV_TAN * aspect,
              )
            }
            const p = passage[next]
            p.camera.copy(camera, false)
            p.angle = view
            p.distance = cameraDistance
            p.x = camera.position.x - position.x
            p.y = camera.position.y - position.y
            p.z = camera.position.z - position.z
            p.age = 0
            p.entered = false
            p.retireReason = undefined
            appearances++
            lastSpecies = a.species
            if (inspect) {
              a.root.updateMatrixWorld(true)
              entrances.push({
                time: elapsed,
                species: a.species,
                angle: view,
                stableFor,
                visible: canBeSeen(a.project(camera).current),
              })
              appearanceLog.push({ time: elapsed, species: a.species })
              if (appearanceLog.length > 64) appearanceLog.shift()
            }
            next = (next + 1) % animals.length
            wait += 15
          }
        }
        animals.forEach((a, i) => {
          if (a.active) passage[i].age += dt
          a.update(dt)
        })
      }
      updateVisibility(camera, position, view, cameraDistance, reduced ? 0 : dt)
    },
    rebase(z: number) {
      offset += z
      if (inspect) rebases++
      segments.forEach((s) => {
        s.group.position.z -= z
      })
      animals.forEach((a) => a.rebase(z))
      ground.position.z -= z
    },
    view(_camera: THREE.Camera, _face: THREE.Vector3, _body: THREE.Box3) {
      return {
        visibleTrees,
        treeBounds,
        visibleObjects,
        faceOcclusions: silhouetteOverlaps,
        silhouetteOverlaps,
        animalOcclusions: 0,
        animalBounds: animalRects,
        characterBounds: characterRect,
      }
    },
    inspect: () => ({
      visibleTrees,
      mediumTrees: treeBounds.filter((r) => (r.maxY - r.minY) / 2 >= 0.15)
        .length,
      treeBounds,
      overlappingProps,
      overlapLog,
      grassWidths,
      visibleObjects,
      overlapFrames,
      foregroundOcclusionFrames,
      visibleExchangeFrames,
      entrances,
      departures,
      animalOcclusionFrames: 0,
      exchanges,
      repeats,
      rebases,
      appearances,
      appearanceLog,
      visibleAppearanceLog,
      offset,
      history: [...history],
      segments: segments.length,
      animals: animals.map((a) => a.inspect()),
      prototypes: prototypes.map((o) => ({
        name: o.children[0]?.name,
        height: new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3())
          .y,
      })),
    }),
  }
}
