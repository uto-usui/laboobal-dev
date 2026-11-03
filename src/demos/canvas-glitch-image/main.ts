import * as THREE from 'three'
import { loop, onResize } from '../../shared/dom'
import {
  FULLSCREEN_VERTEX,
  coverScale,
  createFullscreenScene,
  loadTexture,
} from '../../shared/b2/gl'
import { createGlStage } from '../../shared/gl'
import noise from '../../shared/glsl/simplex-noise.glsl?raw'
import photo from './assets/photo.jpg'
import glitch from './assets/glitch.frag?raw'

const stage = document.querySelector<HTMLElement>('.glitch-image')!
const canvas = stage.querySelector<HTMLCanvasElement>('canvas')!

const texture = await loadTexture(photo.src)
// 走査線やブロックで横にずらした先は、端で折り返す
texture.wrapS = THREE.MirroredRepeatWrapping

const uniforms = {
  uImage: { value: texture },
  uCover: { value: new THREE.Vector2(1, 1) },
  uResolution: { value: new THREE.Vector2(1, 1) },
  uTime: { value: 0 },
}
const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: FULLSCREEN_VERTEX,
  fragmentShader: noise + glitch,
})
const { scene, camera } = createFullscreenScene(material)
const renderer = createGlStage(canvas)

if (renderer) {
  onResize(stage, ({ width, height }) => {
    renderer.setSize(width, height, false)
    // ずれの量は px で書いているので、CSS の px の大きさを渡す
    uniforms.uResolution.value.set(width, height)
    coverScale(width, height, photo.width, photo.height, uniforms.uCover.value)
  })

  loop((_dt, elapsed) => {
    // time * time を使う式があるので、大きくなりすぎないよう 10 分で戻す（3 秒の周期の倍数）
    uniforms.uTime.value = elapsed % 600
    renderer.render(scene, camera)
  })
}
