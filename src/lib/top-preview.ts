import * as THREE from 'three'
import { pixelRatio } from '../shared/dom'

/** 板の今の位置と傾き。名前の帯（DOM）を板に合わせて動かすのに使う */
export interface PreviewFrame {
  x: number
  y: number
  tilt: number
  width: number
  /** 左下の角が、曲がってずれた量（px、画面の向き） */
  cornerX: number
  cornerY: number
}

// ばねの硬さと減り方。減り方を臨界より少し弱くして、止めたときにわずかに行き過ぎて戻るようにする
const STIFFNESS = 120
const DAMPING = 13
// 速さ（px/秒）に掛けて、端が中心から遅れる量にする。速く振っても 30px ほどしか曲がらない
const BEND = 0.012
const MAX_SPEED = 2500
const TILT = 0.00002
// 秒数。開くのはじわっと、切るのは昔のテレビのようにパツンと、項目を替えるのはチャンネルを回すように短く
const OPEN = 0.8
const CLOSE = 0.28
const SWAP = 0.3
// 切り替えのうち、横線までつぶれる割合。ここで中身を入れ替え、残りで広げる
const SWAP_AT = 0.35

const vertexShader = /* glsl */ `
  uniform vec2 uSize;
  uniform vec2 uVelocity;
  uniform float uClose;
  uniform float uSqueeze;

  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 p = position;

    // 切るとき: 縦につぶれて横線になり、横線が点に縮んで消える
    float k1 = smoothstep(0.0, 0.5, uClose);
    float k2 = smoothstep(0.45, 1.0, uClose);
    // 項目を替えるとき: 横線までつぶれてから広がる（uSqueeze は 0〜1〜0）
    float squash = max(k1 * k1, uSqueeze);
    p.y *= mix(1.0, 2.0 / uSize.y, squash);
    p.x *= mix(1.0 + 0.08 * max(k1, uSqueeze), 0.004, k2 * k2);

    // 真ん中が先に進み、上下（左右）の端ほど遅れて、帆のようにたわむ
    vec2 n = position.xy / uSize;
    p.x -= uVelocity.x * ${BEND} * 4.0 * n.y * n.y;
    p.y -= uVelocity.y * ${BEND} * 4.0 * n.x * n.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpen;
  uniform float uClose;
  uniform float uSqueeze;
  uniform float uStatic;
  uniform float uTime;
  uniform vec2 uSize;

  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    // 真ん中から四角く開く
    vec2 d = abs(vUv - 0.5) * 2.0;
    if (max(d.x, d.y) > uOpen) discard;

    vec3 rgb = texture2D(uMap, vUv).rgb;
    // 切り替えの途中だけ、砂嵐と走査線をかぶせる
    vec2 cell = floor(vUv * uSize / 2.0);
    float noise = hash(cell + floor(uTime * 60.0));
    float scan = 0.85 + 0.15 * sin(vUv.y * uSize.y * 1.5);
    rgb = mix(rgb, vec3(noise) * scan, uStatic * 0.6);
    // 横線に近いほど白く光る
    float flash = max(smoothstep(0.1, 0.5, uClose), uSqueeze);
    rgb = mix(rgb, vec3(1.0), flash * 0.9);
    gl_FragColor = vec4(rgb, 1.0 - smoothstep(0.85, 1.0, uClose));
  }
`

const sizeOf = () => {
  const width = Math.min(innerWidth * 0.36, 400)
  return { width, height: (width * 10) / 16 }
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

/**
 * トップで名前に触れたときの動画を、WebGL の板に貼ってカーソルを追わせる。
 * WebGL が使えなければ null を返す（呼ぶ側は DOM の動画に戻す）
 */
export const createGlPreview = (
  canvas: HTMLCanvasElement,
  onFrame: (frame: PreviewFrame) => void,
  /** 中身が slug のものに入れ替わったとき。切り替えでは横線になった瞬間に呼ぶ */
  onLoad: (slug: string) => void,
) => {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  } catch {
    return null
  }
  renderer.setPixelRatio(pixelRatio())
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  // 1 単位を 1px にして、画面の座標をそのまま使う
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10)
  const uniforms = {
    uSize: { value: new THREE.Vector2(1, 1) },
    uVelocity: { value: new THREE.Vector2() },
    uMap: { value: null as THREE.Texture | null },
    uOpen: { value: 0 },
    uClose: { value: 0 },
    uSqueeze: { value: 0 },
    uStatic: { value: 0 },
    uTime: { value: 0 },
  }
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader }),
  )
  mesh.visible = false
  scene.add(mesh)

  let size = sizeOf()
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false)
    camera.left = -innerWidth / 2
    camera.right = innerWidth / 2
    camera.top = innerHeight / 2
    camera.bottom = -innerHeight / 2
    camera.updateProjectionMatrix()
    size = sizeOf()
    mesh.geometry.dispose()
    // たわませるので細かく分ける
    mesh.geometry = new THREE.PlaneGeometry(size.width, size.height, 32, 20)
    uniforms.uSize.value.set(size.width, size.height)
  }
  resize()
  addEventListener('resize', resize)

  // 動画は画面に置かず、テクスチャの元にだけ使う
  const video = document.createElement('video')
  video.muted = true
  video.loop = true
  video.playsInline = true
  const videoTexture = new THREE.VideoTexture(video)
  const posters = new Map<string, THREE.Texture>()
  const loader = new THREE.TextureLoader()
  let current = ''

  const loading = new Set<string>()
  /** 読み終えたポスターを返す。まだなら読み始め、読み終えたときに今の項目ならすぐ出す */
  const poster = (slug: string) => {
    const cached = posters.get(slug)
    if (cached || loading.has(slug)) return cached
    loading.add(slug)
    loader.load(`/previews/${slug}.webp`, (texture) => {
      posters.set(slug, texture)
      if (current === slug && uniforms.uMap.value !== videoTexture)
        uniforms.uMap.value = texture
    })
    return undefined
  }

  video.addEventListener('playing', () => {
    if (video.dataset.slug === current) uniforms.uMap.value = videoTexture
  })

  /** 中身を slug のものにする。ポスターを先に出し、動画が流れ始めたら差し替える */
  const load = (slug: string) => {
    current = slug
    onLoad(slug)
    const cached = poster(slug)
    if (cached) uniforms.uMap.value = cached
    video.dataset.slug = slug
    video.src = `/previews/${slug}.webm`
    video.play().catch(() => {})
  }

  const target = { x: innerWidth / 2, y: innerHeight / 2 }
  const pos = { ...target }
  const vel = { x: 0, y: 0 }
  let active = false
  // それぞれの進み具合（0〜1）。一定の速さで進め、曲線はかけてから渡す
  let open = 0
  let close = 0
  // 0 なら切り替えていない
  let swap = 0
  let pending = ''
  let frame = 0
  let last = 0

  const step = (dt: number) => {
    // ばねは dt が大きいと暴れるので、細かく刻んで進める
    const n = Math.ceil(dt / (1 / 120))
    const h = dt / n
    for (let i = 0; i < n; i++) {
      vel.x += (STIFFNESS * (target.x - pos.x) - DAMPING * vel.x) * h
      vel.y += (STIFFNESS * (target.y - pos.y) - DAMPING * vel.y) * h
      pos.x += vel.x * h
      pos.y += vel.y * h
    }
  }

  const tick = (now: number) => {
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.1))
    last = now
    step(dt)
    uniforms.uTime.value = now / 1000

    if (active) open = Math.min(1, open + dt / OPEN)
    else {
      close = Math.min(1, close + dt / CLOSE)
      if (close === 1) open = 0
    }

    if (swap > 0) {
      const before = swap
      swap += dt / SWAP
      if (before < SWAP_AT && swap >= SWAP_AT) load(pending)
      if (swap >= 1) swap = 0
    }
    // つぶれるのは加速して、広がるのは減速して
    const squeeze =
      swap === 0
        ? 0
        : swap < SWAP_AT
          ? (swap / SWAP_AT) ** 2
          : 1 - easeOutCubic((swap - SWAP_AT) / (1 - SWAP_AT))
    uniforms.uOpen.value = easeOutCubic(open)
    uniforms.uClose.value = close
    uniforms.uSqueeze.value = squeeze
    uniforms.uStatic.value = swap >= SWAP_AT ? squeeze : 0

    const speed = Math.hypot(vel.x, vel.y)
    const k = speed > MAX_SPEED ? MAX_SPEED / speed : 1
    const vx = vel.x * k
    const vy = vel.y * k
    const tilt = THREE.MathUtils.clamp(vx * TILT, -0.06, 0.06)
    // three は上が正、画面は下が正
    uniforms.uVelocity.value.set(vx, -vy)
    mesh.position.set(pos.x - innerWidth / 2, innerHeight / 2 - pos.y, 0)
    mesh.rotation.z = -tilt
    renderer.render(scene, camera)
    onFrame({
      x: pos.x,
      y: pos.y,
      tilt,
      width: size.width,
      cornerX: -vx * BEND,
      cornerY: -vy * BEND,
    })

    // 切りきって止まったら回さない
    if (!active && open === 0) {
      mesh.visible = false
      swap = 0
      renderer.render(scene, camera)
      frame = 0
      return
    }
    frame = requestAnimationFrame(tick)
  }

  const start = () => {
    if (frame) return
    last = performance.now()
    frame = requestAnimationFrame(tick)
  }

  return {
    setTarget(x: number, y: number) {
      target.x = x
      target.y = y
    },
    show(slug: string) {
      const showing = active && open > 0
      if (!active && close > 0) {
        // 切っている途中か切ったあとなら、はじめから開く
        open = 0
        close = 0
        swap = 0
      }
      if (!mesh.visible) {
        // 閉じていたところから開くときは、遠くから飛んでこないよう今の位置から始める
        pos.x = target.x
        pos.y = target.y
        vel.x = 0
        vel.y = 0
      }
      active = true
      mesh.visible = true

      if (showing && slug !== (swap > 0 ? pending : current)) {
        // 開いているところで項目が替わったら、チャンネルを回すように切り替える。
        // 広がっている途中なら、またつぶすところから
        pending = slug
        if (swap === 0 || swap >= SWAP_AT) swap = Number.EPSILON
      } else if (!showing && slug !== current) load(slug)
      else video.play().catch(() => {})
      start()
    },
    hide() {
      active = false
      video.pause()
    },
    /** 切り替えたときにすぐ出せるよう、ポスターを先に読んでおく */
    prefetch(slugs: string[]) {
      slugs.forEach((slug) => poster(slug))
    },
  }
}
