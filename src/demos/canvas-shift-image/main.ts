import * as THREE from 'three'
import { loop, onResize } from '../../shared/dom'
import { damp } from '../../shared/math'
import {
  FULLSCREEN_VERTEX,
  coverScale,
  createFullscreenScene,
  loadTexture,
  createGlStage,
} from '../../shared/gl'
import { pointerOrWander, trackPointer } from '../../shared/pointer'
import photo from './assets/photo.webp'
import fragmentShader from './assets/shift.frag?raw'

const stage = document.querySelector<HTMLElement>('.shift-image')!
const canvas = stage.querySelector<HTMLCanvasElement>('canvas')!

const texture = await loadTexture(photo.src)
// 端でずれた先が画面の外に出ても、端の色を伸ばして埋める
texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping

const uniforms = {
  uImage: { value: texture },
  uCover: { value: new THREE.Vector2(1, 1) },
  uShift: { value: new THREE.Vector2() },
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
    coverScale(width, height, photo.width, photo.height, uniforms.uCover.value)
  })

  const pointer = trackPointer(stage, {
    units: 'unit',
    touch: 'ignore',
    leave: 'center',
  })
  const current = { x: 0, y: 0 }
  /** マウスが端にあるときの、赤のずれ（uv）。青はこの 4 倍ずれる */
  const MAX_SHIFT = 0.014

  loop((dt, elapsed) => {
    const target = pointerOrWander(pointer, elapsed)
    // 旧デモの「毎フレーム 7.5% だけ近づく」。遅れて追うので、止めたあとも少しにじみが動く
    current.x = damp(current.x, target.x, 4.7, dt)
    current.y = damp(current.y, target.y, 4.7, dt)
    // 真ん中から離れるほど大きくずれる。uv の y は下から上なので向きを返す
    uniforms.uShift.value.set(current.x * MAX_SHIFT, -current.y * MAX_SHIFT)
    renderer.render(scene, camera)
  })
}
