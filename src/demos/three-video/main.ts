import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { loop, onResize } from '../../shared/dom'
import { createGlStage } from '../../shared/gl'
import { onReducedMotion } from '../../shared/motion'
import { touchGate } from '../../shared/touch'

const stage = document.querySelector<HTMLElement>('.video-demo')!
const canvas = stage.querySelector<HTMLCanvasElement>('canvas')!
const video = stage.querySelector<HTMLVideoElement>('video')!

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xbb0000)

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
camera.position.set(40, 0, 50)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
// 記事の iframe の上でホイールを奪わないよう、寄ったり引いたりはしない
controls.enableZoom = false
controls.enablePan = false
// 地面の下へ回り込まない
controls.maxPolarAngle = Math.PI * 0.56
// OrbitControls は canvas を touch-action: none にする。記事を読む人の縦のスクロールを奪わないよう、タップするまでは pan-y にする
touchGate(canvas)

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(1000, 1000),
  new THREE.MeshPhongMaterial({ color: 0xffffff }),
)
ground.rotation.x = -Math.PI / 2
ground.position.y = -20
ground.receiveShadow = true
scene.add(ground)

// 光の減り方を切り、旧デモ（three r100 ごろ）の明るさに合わせる。今の three は距離の 2 乗で暗くなり、強さも π 倍の目盛り
const spotLight = new THREE.SpotLight(
  0xffffff,
  Math.PI,
  0,
  Math.PI / 3,
  0.05,
  0,
)
spotLight.position.set(0, 30, 50)
spotLight.castShadow = true
spotLight.shadow.mapSize.set(2048, 2048)
scene.add(spotLight)
scene.add(new THREE.AmbientLight(0x444444, Math.PI))

// 動画を毎フレーム読み直すテクスチャ。動画の色は sRGB なので、そう伝えないと白っぽくなる
const texture = new THREE.VideoTexture(video)
texture.colorSpace = THREE.SRGBColorSpace

const mesh = new THREE.Mesh(
  new THREE.IcosahedronGeometry(8, 0),
  new THREE.MeshStandardMaterial({
    map: texture,
    metalness: 0.2,
    roughness: 0.05,
  }),
)
mesh.castShadow = true
scene.add(mesh)

const renderer = createGlStage(canvas, { antialias: true })

if (renderer) {
  renderer.shadowMap.enabled = true

  // 動きを減らす設定では、動画と多面体の回転を止める。ドラッグで見る向きを変えるのは残す
  let reduced = false
  onReducedMotion((value) => {
    reduced = value
    // 音のない動画は自動で再生できる。止められても、形と影は描けるので握りつぶす
    if (reduced) video.pause()
    else video.play().catch(() => {})
  })
  // 再生しないままでも最初のコマを貼る。three は新しいコマが出るのを待って貼り直すので、止まった動画では貼られない
  const showFrame = () => (texture.needsUpdate = true)
  if (video.readyState >= video.HAVE_CURRENT_DATA) showFrame()
  else video.addEventListener('loadeddata', showFrame, { once: true })

  onResize(stage, ({ width, height }) => {
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  })

  loop((dt) => {
    // 旧デモは毎フレーム 0.01 rad。60fps で 1 秒に 0.6 rad
    if (!reduced) mesh.rotation.x += 0.6 * dt
    controls.update()
    renderer.render(scene, camera)
  })
}
