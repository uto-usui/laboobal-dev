import { ShaderMaterial } from 'three'
import noise from '../../shared/glsl/simplex-noise.glsl?raw'
import { onResize } from '../../shared/dom'
import { autoplayLoop } from '../../shared/motion'
import {
  FULLSCREEN_VERTEX,
  createFullscreenScene,
  createGlStage,
} from '../../shared/gl'
import fragmentShader from './assets/amoeba.frag?raw'

const canvas = document.querySelector<HTMLCanvasElement>('.amoeba canvas')!

const material = new ShaderMaterial({
  uniforms: {
    time: { value: 0 },
    aspectRatio: { value: 1 },
  },
  vertexShader: FULLSCREEN_VERTEX,
  fragmentShader: noise + fragmentShader,
})
const { scene, camera } = createFullscreenScene(material)

const render = () => renderer?.render(scene, camera)
const renderer = createGlStage(canvas, { antialias: false, onRestore: render })

if (renderer) {
  renderer.setClearColor(0x000000)

  onResize(canvas, ({ width, height }) => {
    renderer.setSize(width, height, false)
    material.uniforms.aspectRatio.value = width / height
    render()
  })

  autoplayLoop((_dt, elapsed) => {
    material.uniforms.time.value = elapsed
    render()
  })
}
