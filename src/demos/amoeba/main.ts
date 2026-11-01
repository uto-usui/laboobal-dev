import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from 'three'
import noise from '../../shared/glsl/simplex-noise.glsl?raw'
import { loop, onResize, prefersReducedMotion } from '../../shared/dom'
import fragmentShader from './assets/amoeba.frag?raw'

const canvas = document.querySelector<HTMLCanvasElement>('.amoeba canvas')!

const renderer = new WebGLRenderer({ canvas, antialias: false })
renderer.setClearColor(0x000000)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

// 2×2 の板を、-1〜1 を写すカメラで見ると、ちょうど画面いっぱいになる
const scene = new Scene()
const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
const material = new ShaderMaterial({
  uniforms: {
    time: { value: 0 },
    aspectRatio: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: noise + fragmentShader,
})
scene.add(new Mesh(new PlaneGeometry(2, 2), material))

const render = () => renderer.render(scene, camera)

onResize(canvas, ({ width, height }) => {
  renderer.setSize(width, height, false)
  material.uniforms.aspectRatio.value = width / height
  render()
})

if (!prefersReducedMotion()) {
  loop((_dt, elapsed) => {
    material.uniforms.time.value = elapsed
    render()
  })
}
