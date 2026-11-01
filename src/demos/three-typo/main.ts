import * as THREE from 'three'
import { loop, onResize } from '../../shared/dom'
import {
  FULLSCREEN_VERTEX,
  createFullscreenScene,
  createRenderer,
  pixelRatio,
} from '../../shared/b2/gl'
import noise from '../../shared/glsl/simplex-noise.glsl?raw'
import typo from './assets/typo.frag?raw'

const stage = document.querySelector<HTMLElement>('.typo')!
const canvas = stage.querySelector<HTMLCanvasElement>('canvas')!
const LETTERS = ['L', 'A', 'B']
const FONT = '700 100px Montserrat'

// 文字は 2D の canvas に書いてからテクスチャにする。書く前にフォントを読み終えておく
await document.fonts.load(FONT)

const textCanvas = document.createElement('canvas')
const texture = new THREE.CanvasTexture(textCanvas)

const drawText = (width: number, height: number) => {
  const dpr = pixelRatio()
  textCanvas.width = Math.round(width * dpr)
  textCanvas.height = Math.round(height * dpr)
  const ctx = textCanvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  const size = Math.min(width * 0.16, height * 0.32)
  ctx.font = FONT.replace('100px', `${size}px`)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ff1a1a'
  // 文字の間を広くあけて、1 文字ずつ崩れるのが見えるようにする
  LETTERS.forEach((letter, i) => {
    ctx.fillText(letter, width / 2 + (i - 1) * size * 1.4, height / 2)
  })
  // 大きさが変わるとテクスチャを作り直す
  texture.dispose()
  texture.needsUpdate = true
}

const uniforms = {
  uText: { value: texture },
  uResolution: { value: new THREE.Vector2(1, 1) },
  uTime: { value: 0 },
  uSeed: { value: Math.random() * 1000 },
}
const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: FULLSCREEN_VERTEX,
  fragmentShader: noise + typo,
})
const { scene, camera } = createFullscreenScene(material)
const renderer = createRenderer(canvas)
renderer.setClearColor(0x000000)

onResize(stage, ({ width, height }) => {
  renderer.setSize(width, height, false)
  uniforms.uResolution.value.set(width, height)
  drawText(width, height)
})

loop((_dt, elapsed) => {
  uniforms.uTime.value = elapsed
  renderer.render(scene, camera)
})
