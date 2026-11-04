import gsap from '../gsap'
import * as THREE from 'three'
import { onResize } from '../dom'
import { onReducedMotion } from '../motion'
import {
  FULLSCREEN_VERTEX,
  coverScale,
  createFullscreenScene,
  createGlStage,
} from '../gl'
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

/**
 * 2 枚の写真を、模様でゆがませながら入れ替えるスライダー。
 * 描くのは切り替えている間と、大きさが変わったときだけ。戻り値で止めて片付ける（canvas も外す）
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
  let disposed = false
  // 写真の読み込みは片付けたあとに終わることがある。片付けた renderer では描かない
  const render = () => {
    if (!disposed) renderer?.render(scene, camera)
  }
  const renderer = createGlStage(canvas, {
    antialias: false,
    onRestore: render,
  })
  if (!renderer) return () => canvas.remove()
  renderer.setClearColor(0x111111)

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
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: `${noise}\n${distortion}\n${fragment}`,
  })
  const { scene, camera } = createFullscreenScene(material)

  let size = { width: 1, height: 1 }
  const cover = (photo: Photo, target: THREE.Vector2) =>
    coverScale(size.width, size.height, photo.width, photo.height, target)

  let current = 0
  const next = () => (current + 1) % photos.length
  const setPair = () => {
    uniforms.uTexture1.value = textures[current]
    uniforms.uTexture2.value = textures[next()]
    cover(photos[current], uniforms.uCover1.value)
    cover(photos[next()], uniforms.uCover2.value)
  }
  setPair()

  const offResize = onResize(root, ({ width, height }) => {
    size = { width, height }
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
  let bulletTimeline: gsap.core.Timeline | undefined
  const moveBullet = (from: number, to: number) => {
    const a = parts(bullets[from])
    const b = parts(bullets[to])
    bulletTimeline = gsap
      .timeline()
      .to(a.text, { opacity: 0.25, duration: 1, ease: 'none' }, 0)
      .set(a.line, { transformOrigin: 'right' }, 0)
      .to(a.line, { scaleX: 0, duration: 1, ease: 'expo.inOut' }, 0)
      .to(b.text, { opacity: 1, duration: 1, ease: 'none' }, 1)
      .set(b.line, { transformOrigin: 'left' }, 1)
      .to(b.line, { scaleX: 1, duration: 1, ease: 'expo.inOut' }, 1)
  }

  let animating = false
  let progressTween: gsap.core.Tween | undefined
  const go = () => {
    if (animating) return
    animating = true
    moveBullet(current, next())
    progressTween = gsap.to(uniforms.uProgress, {
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
  // 動きを減らす設定の間は自動で進めない。クリックでは切り替わる
  let timer: gsap.core.Tween | undefined
  const autoplay = () => {
    timer = gsap.delayedCall(interval, autoplay)
    go()
  }
  const offMotion = onReducedMotion((reduced) => {
    timer?.kill()
    timer = reduced ? undefined : gsap.delayedCall(interval, autoplay)
  })

  return () => {
    disposed = true
    offMotion()
    offResize()
    root.removeEventListener('click', go)
    timer?.kill()
    progressTween?.kill()
    bulletTimeline?.kill()
    for (const texture of textures) texture.dispose()
    material.dispose()
    canvas.remove()
    renderer.dispose()
  }
}
