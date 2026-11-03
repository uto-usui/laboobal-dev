import * as THREE from 'three'
import { loop, onResize } from '../../shared/dom'
import { damp } from '../../shared/math'
import {
  FULLSCREEN_VERTEX,
  coverScale,
  createFullscreenScene,
  createGlStage,
} from '../../shared/gl'
import { pointerOrWander, trackPointer } from '../../shared/pointer'
import fragmentShader from './assets/fake3d.frag?raw'
import { HEIGHT, WIDTH, paintScene } from './scene'

const stage = document.querySelector<HTMLElement>('.fake3d')!
const canvas = stage.querySelector<HTMLCanvasElement>('.gl')!
const preview = stage.querySelector<HTMLCanvasElement>('.depth canvas')!

const { color, depth } = paintScene()

// 深度の画像を隅に小さく見せる
preview.width = 240
preview.height = (240 * HEIGHT) / WIDTH
preview.getContext('2d')!.drawImage(depth, 0, 0, preview.width, preview.height)

const uniforms = {
  uImage: { value: new THREE.CanvasTexture(color) },
  uDepth: { value: new THREE.CanvasTexture(depth) },
  uMouse: { value: new THREE.Vector2() },
  // 大きいほどずれが小さい。縦は横より控えめにする
  uThreshold: { value: new THREE.Vector2(22, 34) },
  uCover: { value: new THREE.Vector2(1, 1) },
}
const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: FULLSCREEN_VERTEX,
  fragmentShader,
})
const { scene, camera } = createFullscreenScene(material)
const renderer = createGlStage(canvas)

if (renderer) {
  onResize(stage, ({ width, height }) => {
    renderer.setSize(width, height, false)
    coverScale(width, height, WIDTH, HEIGHT, uniforms.uCover.value)
  })

  const pointer = trackPointer(stage, {
    units: 'unit',
    touch: 'ignore',
    leave: 'center',
  })
  const mouse = { x: 0, y: 0 }

  loop((dt, elapsed) => {
    const target = pointerOrWander(pointer, elapsed)
    // 旧デモの「毎フレーム 5% だけ近づく」。ゆっくり追いつくので、見ている面が重く動く
    mouse.x = damp(mouse.x, target.x, 3, dt)
    mouse.y = damp(mouse.y, target.y, 3, dt)
    // 手前がマウスの側へ寄るよう、横だけ向きを返す（uv の y は下から上）
    uniforms.uMouse.value.set(-mouse.x, mouse.y)
    renderer.render(scene, camera)
  })
}
