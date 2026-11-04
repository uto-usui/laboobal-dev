import * as THREE from 'three'
import { onResize } from '../../shared/dom'
import {
  FULLSCREEN_VERTEX,
  coverScale,
  createFullscreenScene,
  loadTexture,
  createGlStage,
} from '../../shared/gl'
import noise from '../../shared/glsl/simplex-noise.glsl?raw'
import { autoplayLoop } from '../../shared/motion'
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
const render = () => renderer?.render(scene, camera)
const renderer = createGlStage(canvas, { onRestore: render })

if (renderer) {
  onResize(stage, ({ width, height }) => {
    renderer.setSize(width, height, false)
    // ずれの量は px で書いているので、CSS の px の大きさを渡す
    uniforms.uResolution.value.set(width, height)
    coverScale(width, height, photo.width, photo.height, uniforms.uCover.value)
    render()
  })

  autoplayLoop(
    (_dt, elapsed) => {
      // time * time を使う式があるので、大きくなりすぎないよう 10 分で戻す（3 秒の周期の倍数）
      uniforms.uTime.value = elapsed % 600
      render()
    },
    // 動きを減らす設定では、崩れの強さが 0 になる時刻（3 秒の周期の真ん中）の 1 コマで止める。点滅させない
    () => {
      uniforms.uTime.value = 1.5
      render()
    },
  )
}
