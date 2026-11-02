import * as THREE from 'three'

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
// 開くのと閉じるのにかける秒数
const ENTER = 0.8
const LEAVE = 0.45

/** 出てくるときの動き。閉じるときは同じ動きを逆に流す */
export const ENTER_MODES = ['roll', 'twist', 'fold', 'drop', 'rect'] as const
export type EnterMode = (typeof ENTER_MODES)[number]

const vertexShader = /* glsl */ `
  uniform vec2 uSize;
  uniform vec2 uVelocity;
  uniform float uProgress;
  uniform int uMode;
  varying vec2 vUv;
  varying float vShade;

  const float PI = 3.141592653589793;

  void main() {
    vUv = uv;
    vec3 p = position;
    float t = uProgress;
    vShade = 1.0;

    if (uMode == 0) {
      // 巻物。左の端に丸まった筒が、右へ転がりながら広がる。front より右はまだ巻かれている
      float r = uSize.x * 0.08;
      float x = p.x + uSize.x * 0.5;
      float front = t * uSize.x;
      if (x > front) {
        float a = (x - front) / r;
        x = front + r * sin(a);
        p.z = r * (1.0 - cos(a));
        vShade = 1.0 - 0.45 * (p.z / (2.0 * r));
      }
      p.x = x - uSize.x * 0.5;
    } else if (uMode == 1) {
      // ねじれ。上の段ほど多く回っていて、下から順にほどける
      float a = (1.0 - t) * PI * (1.0 + 1.5 * uv.y);
      float x = p.x;
      p.x = x * cos(a);
      p.z = x * sin(a);
      vShade = 0.6 + 0.4 * abs(cos(a));
    } else if (uMode == 2) {
      // 屏風。8 枚の細い板が、山と谷を交互に作って畳まれている
      float n = 8.0;
      float w = uSize.x / n;
      float x = p.x + uSize.x * 0.5;
      float i = min(floor(x / w + 0.0001), n - 1.0);
      float u = x - i * w;
      float a = (1.0 - t) * PI * 0.5 * 0.92;
      bool even = mod(i, 2.0) < 0.5;
      p.x = (i * w + u) * cos(a) - uSize.x * 0.5 * cos(a);
      p.z = (even ? u : w - u) * sin(a);
      vShade = even ? 1.0 : 1.0 - 0.5 * sin(a);
    } else if (uMode == 3) {
      // 水滴。真ん中から波が広がり、開ききると静まる
      float d = length(p.xy / uSize.x);
      p.z = sin(d * 28.0 - t * 18.0) * (1.0 - t) * uSize.x * 0.05;
      vShade = 1.0 + 0.25 * cos(d * 28.0 - t * 18.0) * (1.0 - t);
    }

    // 真ん中が先に進み、上下（左右）の端ほど遅れて、帆のようにたわむ
    vec2 n = position.xy / uSize;
    p.x -= uVelocity.x * ${BEND} * 4.0 * n.y * n.y;
    p.y -= uVelocity.y * ${BEND} * 4.0 * n.x * n.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uProgress;
  uniform int uMode;
  uniform vec2 uSize;
  varying vec2 vUv;
  varying float vShade;

  void main() {
    float t = uProgress;
    vec2 uv = vUv;
    float alpha = smoothstep(0.0, 0.12, t);
    if (uMode == 3) {
      // 丸く開く。開ききる手前で四角に戻す
      vec2 c = (vUv - 0.5) * vec2(uSize.x / uSize.y, 1.0);
      float radius = t * 1.1;
      if (length(c) > radius && t < 0.999) discard;
      uv += normalize(c + 1e-5) * sin(length(c) * 30.0 - t * 18.0) * 0.02 * (1.0 - t);
    } else if (uMode == 4) {
      vec2 d = abs(vUv - 0.5) * 2.0;
      if (max(d.x, d.y) > t) discard;
      alpha = 1.0;
    }
    vec4 color = texture2D(uMap, uv);
    // 裏側は暗く見せる（巻物とねじれで見える）
    float shade = gl_FrontFacing ? vShade : vShade * 0.45;
    gl_FragColor = vec4(color.rgb * shade, color.a * alpha);
  }
`

const sizeOf = () => {
  const width = Math.min(innerWidth * 0.36, 400)
  return { width, height: (width * 10) / 16 }
}

/**
 * トップで名前に触れたときの動画を、WebGL の板に貼ってカーソルを追わせる。
 * WebGL が使えなければ null を返す（呼ぶ側は DOM の動画に戻す）
 */
export const createGlPreview = (
  canvas: HTMLCanvasElement,
  onFrame: (frame: PreviewFrame) => void,
  mode: string = 'roll',
) => {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  } catch {
    return null
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  // 巻いたりねじったりした奥行きが見えるよう、遠近を付ける。z = 0 の面で 1 単位が 1px になる距離に置く
  const FOV = 30
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 10000)
  const uniforms = {
    uSize: { value: new THREE.Vector2(1, 1) },
    uVelocity: { value: new THREE.Vector2() },
    uMap: { value: null as THREE.Texture | null },
    uProgress: { value: 0 },
    // 知らない名前なら巻物にする
    uMode: { value: Math.max(0, ENTER_MODES.indexOf(mode as EnterMode)) },
  }
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
    }),
  )
  mesh.visible = false
  scene.add(mesh)

  let size = sizeOf()
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false)
    camera.aspect = innerWidth / innerHeight
    camera.position.z =
      innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    camera.updateProjectionMatrix()
    size = sizeOf()
    mesh.geometry.dispose()
    // 曲げるので細かく分ける
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

  video.addEventListener('playing', () => {
    if (video.dataset.slug === current) uniforms.uMap.value = videoTexture
  })

  const target = { x: innerWidth / 2, y: innerHeight / 2 }
  const pos = { ...target }
  const vel = { x: 0, y: 0 }
  let active = false
  // 開き具合（0〜1）。一定の速さで進め、シェーダーには曲線をかけて渡す
  let open = 0
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
    open = THREE.MathUtils.clamp(
      open + (active ? dt / ENTER : -dt / LEAVE),
      0,
      1,
    )
    uniforms.uProgress.value = 1 - Math.pow(1 - open, 3)

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

    // 閉じきって止まったら回さない
    if (!active && open === 0) {
      mesh.visible = false
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
      if (!active && !mesh.visible) {
        // 閉じていたところから開くときは、遠くから飛んでこないよう今の位置から始める
        pos.x = target.x
        pos.y = target.y
        vel.x = 0
        vel.y = 0
      }
      active = true
      mesh.visible = true
      if (slug !== current) {
        current = slug
        const poster = posters.get(slug)
        uniforms.uMap.value = poster ?? uniforms.uMap.value
        if (!poster)
          loader.load(`/previews/${slug}.jpg`, (texture) => {
            posters.set(slug, texture)
            if (current === slug && uniforms.uMap.value !== videoTexture)
              uniforms.uMap.value = texture
          })
        video.dataset.slug = slug
        video.src = `/previews/${slug}.webm`
      }
      video.play().catch(() => {})
      start()
    },
    hide() {
      active = false
      video.pause()
    },
  }
}
