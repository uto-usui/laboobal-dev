import { gsap } from '../../shared/gsap'
import {
  BufferAttribute,
  Color,
  DirectionalLight,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshPhongMaterial,
  PerspectiveCamera,
  Scene,
} from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { loop, onResize, prefersReducedMotion } from '../../shared/dom'
import { createGlStage } from '../../shared/gl'
import { damp, map } from '../../shared/math'
import { createNoise } from '../../shared/noise'

const canvas = document.querySelector<HTMLCanvasElement>('.blob canvas')!
let width = 0
let height = 0

const renderer = createGlStage(canvas, {
  antialias: true,
  alpha: true,
  onRestore: () => update(0, now),
})

const scene = new Scene()
const camera = new PerspectiveCamera(100, 1, 0.1, 10000)
camera.position.set(0, 0, 400)

// 上から白、下から青の光を 2 つと、紫の平行光。今の three は色を線形の空間で計算するので、
// 旧デモの暗い紺と紫のままだと青みが消える。旧デモの見え方に合わせて色と明るさを決め直した
const sky = new HemisphereLight(0xffffff, 0x2a2ad0, 1)
const sky2 = sky.clone()
sky2.position.set(-200, 300, 400)
const directional = new DirectionalLight(0x8a4dff, 1.5)
directional.position.set(-200, 300, 400)
scene.add(sky, sky2, directional)

// 20 面体を 4 回細かくした球。面ごとに頂点が分かれたままだと陰影が角張るので、同じ位置の頂点をまとめる
const icosahedron = new IcosahedronGeometry(100, 4)
icosahedron.deleteAttribute('normal')
icosahedron.deleteAttribute('uv')
const geometry = mergeVertices(icosahedron)
const position = geometry.getAttribute('position') as BufferAttribute
const origin = Float32Array.from(position.array)

const shape = new Mesh(
  geometry,
  new MeshPhongMaterial({
    emissive: new Color('hsl(170, 60%, 80%)'),
    emissiveIntensity: 0.06,
    shininess: 25,
  }),
)
scene.add(shape)

const noise = createNoise()
// y がマウスの縦の位置（0〜1）。下にあるほど大きく波打つ
const force = { y: 0.5 }
const mouse = { x: 0 }
let angle = 0
let now = 0

/** 頂点ごとに、場所と時間で決まるノイズで球の半径を伸び縮みさせる */
const deform = (ms: number) => {
  const array = position.array as Float32Array
  for (let i = 0; i < array.length; i += 3) {
    const x = origin[i]
    const y = origin[i + 1]
    const z = origin[i + 2]
    const n = noise.noise3D(
      x * 0.006 + ms * 0.0002,
      y * 0.006 + ms * 0.0003,
      z * 0.006,
    )
    const ratio = (n * 0.2 * (force.y + 0.1) + 0.8) * 2
    array[i] = x * ratio
    array[i + 1] = y * ratio
    array[i + 2] = z * ratio
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
}

const update = (dt: number, elapsed: number) => {
  now = elapsed
  deform(elapsed * 1000)
  shape.rotation.x += 0.3 * dt
  shape.rotation.y += 0.3 * dt

  // マウスの横の位置を 0〜360 度にし、カメラをゆっくり球のまわりに回す
  const target = (mouse.x / (width || 1)) * Math.PI * 2
  angle = damp(angle, target, 0.3, dt)
  camera.position.set(400 * Math.sin(angle), 0, 400 * Math.cos(angle))
  camera.lookAt(0, 0, 0)
  renderer?.render(scene, camera)
}

// マウスが動くたびに、今の値から新しい値へ向かい直す。gsap.to を毎回作ると tween が積み重なる
const forceY = gsap.quickTo(force, 'y', { duration: 0.3, ease: 'power3.out' })
const shapeX = gsap.quickTo(shape.position, 'x', {
  duration: 2,
  ease: 'power3.out',
})
const shapeY = gsap.quickTo(shape.position, 'y', {
  duration: 2,
  ease: 'power3.out',
})

if (renderer) {
  window.addEventListener('pointermove', (event) => {
    mouse.x = event.clientX
    forceY(event.clientY / height)
    shapeX(map(event.clientX, 0, width, -100, 100))
    shapeY(map(event.clientY, 0, height, -100, 100))
  })

  onResize(canvas, (size) => {
    ;({ width, height } = size)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    update(0, now)
  })

  if (!prefersReducedMotion()) loop(update)
}
