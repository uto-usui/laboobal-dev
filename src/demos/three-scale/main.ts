import * as THREE from 'three'
import { gsap } from 'gsap'
import { onResize } from '../../shared/dom'
import { createRenderer } from '../../shared/b2/gl'
import vertexShader from './assets/scale.vert?raw'
import fragmentShader from './assets/scale.frag?raw'

const stage = document.querySelector<HTMLElement>('.scale')!
const canvas = stage.querySelector<HTMLCanvasElement>('canvas')!
const items = [...stage.querySelectorAll<HTMLButtonElement>('.item')]

const uniforms = {
  uProgress: { value: 0 },
  uMode: { value: 0 },
  uMeshScale: { value: new THREE.Vector2(1, 1) },
  uMeshPosition: { value: new THREE.Vector2() },
  uViewSize: { value: new THREE.Vector2(1, 1) },
  uColor: { value: new THREE.Color() },
}

const renderer = createRenderer(canvas, { alpha: true, antialias: true })
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
camera.position.z = 50
// 1 × 1 の板を 1 枚だけ使い回す。押された箱の大きさと位置に合わせてから広げる。
// 細かく分けておかないと、頂点ごとに遅らせたときに曲がって見えない
const mesh = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1, 64, 64),
  new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader }),
)
mesh.visible = false
scene.add(mesh)

let size = { width: 1, height: 1 }
let active: HTMLButtonElement | undefined

/** カメラから見える範囲の大きさ（three の単位）。この大きさまで広げれば画面いっぱいになる */
const viewSize = () => {
  const height =
    2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  return { width: height * camera.aspect, height }
}

/** 板を、DOM の箱と同じ大きさと位置に置く。px を three の単位に直す */
const fitMeshTo = (item: HTMLElement) => {
  const rect = item.getBoundingClientRect()
  const stageRect = stage.getBoundingClientRect()
  const view = viewSize()
  const unitX = view.width / size.width
  const unitY = view.height / size.height
  const width = rect.width * unitX
  const height = rect.height * unitY
  // 左上が原点の px から、真ん中が原点で上が正の単位へ
  const x =
    (rect.left - stageRect.left + rect.width / 2) * unitX - view.width / 2
  const y =
    view.height / 2 - (rect.top - stageRect.top + rect.height / 2) * unitY

  mesh.scale.set(width, height, 1)
  mesh.position.set(x, y, 0)
  uniforms.uMeshScale.value.set(width, height)
  // シェーダーの中の座標は scale を掛ける前なので、大きさで割っておく
  uniforms.uMeshPosition.value.set(x / width, y / height)
  // ちょうどの大きさだと、広がりきったときに縁が 1px 残ることがある
  uniforms.uViewSize.value.set(view.width * 1.01, view.height * 1.01)
}

const render = () => renderer.render(scene, camera)

const play = (item: HTMLButtonElement, index: number) => {
  if (active) return
  active = item
  uniforms.uMode.value = index
  uniforms.uColor.value.set(getComputedStyle(item).backgroundColor)
  fitMeshTo(item)
  mesh.visible = true
  item.style.visibility = 'hidden'

  gsap
    .timeline({
      onUpdate: render,
      onComplete: () => {
        item.style.visibility = ''
        mesh.visible = false
        active = undefined
        render()
      },
    })
    .to(uniforms.uProgress, { value: 1, duration: 1, ease: 'power1.out' })
    // 広がりきったら少しだけ止めて、元の箱へ戻す
    .to(uniforms.uProgress, {
      value: 0,
      duration: 1,
      ease: 'power1.out',
      delay: 0.2,
    })
}

items.forEach((item, index) =>
  item.addEventListener('click', () => play(item, index)),
)

onResize(stage, ({ width, height }) => {
  size = { width, height }
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  if (active) fitMeshTo(active)
  render()
})
