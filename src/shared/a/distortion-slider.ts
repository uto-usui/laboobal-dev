import gsap from '../gsap'
import * as THREE from 'three'
import { onResize, prefersReducedMotion } from '../dom'
import { createGlStage } from '../gl'
import noise from '../glsl/simplex-noise.glsl?raw'
import distortion from './glsl/distortion.glsl?raw'

interface Photo {
  src: string
  width: number
  height: number
}

interface Options {
  /** canvas と番号の入れ物。中の .bullet を番号として動かす */
  root: HTMLElement
  photos: Photo[]
  /** ゆがみの強さ。uniform の uIntensity になる */
  intensity: number
  /** 切り替えの式だけを書いたフラグメントシェーダー。pattern と cover は先頭に足す */
  fragment: string
  /** 切り替えにかける秒数 */
  duration?: number
  /** 自動で次へ進む間隔（秒）。切り替えを含む */
  interval?: number
}

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

/**
 * 2 枚の写真を、模様でゆがませながら入れ替えるスライダー。
 * 描くのは切り替えている間と、大きさが変わったときだけ
 */
export const createDistortionSlider = ({
  root,
  photos,
  intensity,
  fragment,
  duration = 2.5,
  interval = 3,
}: Options) => {
  const canvas = document.createElement('canvas')
  root.prepend(canvas)
  const render = () => renderer?.render(scene, camera)
  const renderer = createGlStage(canvas, {
    antialias: false,
    onRestore: render,
  })
  if (!renderer) return
  renderer.setClearColor(0x111111)

  const scene = new THREE.Scene()
  // 頂点シェーダーで -1〜1 の面をそのまま画面に置くので、カメラは形だけ
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  const loader = new THREE.TextureLoader()
  const textures = photos.map((photo) => {
    const texture = loader.load(photo.src, render)
    texture.minFilter = THREE.LinearFilter
    texture.generateMipmaps = false
    return texture
  })

  const uniforms = {
    uTexture1: { value: textures[0] },
    uTexture2: { value: textures[1] },
    uCover1: { value: new THREE.Vector2(1, 1) },
    uCover2: { value: new THREE.Vector2(1, 1) },
    uProgress: { value: 0 },
    uIntensity: { value: intensity },
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: `${noise}\n${distortion}\n${fragment}`,
  })
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))

  let aspect = 1
  const coverScale = (photo: Photo, target: THREE.Vector2) => {
    const ratio = aspect / (photo.width / photo.height)
    return ratio > 1 ? target.set(1, 1 / ratio) : target.set(ratio, 1)
  }

  let current = 0
  const next = () => (current + 1) % photos.length
  const setPair = () => {
    uniforms.uTexture1.value = textures[current]
    uniforms.uTexture2.value = textures[next()]
    coverScale(photos[current], uniforms.uCover1.value)
    coverScale(photos[next()], uniforms.uCover2.value)
  }
  setPair()

  onResize(root, ({ width, height }) => {
    aspect = width / height
    renderer.setSize(width, height, false)
    setPair()
    render()
  })

  // 番号: 今の番号の線を右へ縮め、1 秒あとに次の番号の線を左からのばす
  const bullets = [...root.querySelectorAll<HTMLElement>('.bullet')]
  const parts = (bullet: HTMLElement) => ({
    text: bullet.querySelector('.bullet-text'),
    line: bullet.querySelector('.bullet-line'),
  })
  bullets.forEach((bullet, i) => {
    if (i === 0) return
    const { text, line } = parts(bullet)
    gsap.set(text, { opacity: 0.25 })
    gsap.set(line, { scaleX: 0, transformOrigin: 'left' })
  })
  const moveBullet = (from: number, to: number) => {
    const a = parts(bullets[from])
    const b = parts(bullets[to])
    gsap
      .timeline()
      .to(a.text, { opacity: 0.25, duration: 1, ease: 'none' }, 0)
      .set(a.line, { transformOrigin: 'right' }, 0)
      .to(a.line, { scaleX: 0, duration: 1, ease: 'expo.inOut' }, 0)
      .to(b.text, { opacity: 1, duration: 1, ease: 'none' }, 1)
      .set(b.line, { transformOrigin: 'left' }, 1)
      .to(b.line, { scaleX: 1, duration: 1, ease: 'expo.inOut' }, 1)
  }

  let animating = false
  const go = () => {
    if (animating) return
    animating = true
    moveBullet(current, next())
    gsap.to(uniforms.uProgress, {
      value: 1,
      duration,
      ease: 'expo.inOut',
      onUpdate: render,
      onComplete: () => {
        // 見た目は 2 枚目のまま、2 枚目を 1 枚目に入れ替えて 0 に戻す
        current = next()
        uniforms.uProgress.value = 0
        setPair()
        render()
        animating = false
      },
    })
  }

  // ホイールでは進めない。記事に埋め込むと、スクロールで通り過ぎるたびに切り替わってしまう
  root.addEventListener('click', go)
  // setInterval ではなく GSAP の時計で数える。画面の外で GSAP を止めている間（shared/gsap.ts）は進まない
  const autoplay = () => {
    gsap.delayedCall(interval, autoplay)
    go()
  }
  if (!prefersReducedMotion()) gsap.delayedCall(interval, autoplay)
}
