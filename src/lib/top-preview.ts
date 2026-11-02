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
// 開くのにかける秒数。巻物は転がる様子を見せたいので長め
const ENTER = { roll: 1.1, rect: 0.8 }
// 巻物は開いたのを逆に巻き戻して閉じる。四角は昔のテレビを切ったように、短くパツンと閉じる
const LEAVE = 0.45
const CLOSE = 0.28

export const ENTER_MODES = ['roll', 'rect'] as const
export type EnterMode = (typeof ENTER_MODES)[number]

const vertexShader = /* glsl */ `
  uniform vec2 uSize;
  uniform vec2 uVelocity;
  uniform float uProgress;
  uniform float uClose;
  uniform int uMode;
  varying vec2 vUv;
  varying vec3 vNormal;

  vec3 rotateY(vec3 v, float a) {
    float c = cos(a), s = sin(a);
    return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
  }

  vec3 rotateX(vec3 v, float a) {
    float c = cos(a), s = sin(a);
    return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z);
  }

  void main() {
    vUv = uv;
    vec3 p = position;
    vec3 normal = vec3(0.0, 0.0, 1.0);
    float t = uProgress;
    float w = uSize.x;

    if (uMode == 0) {
      // 巻物。front より右は、左の端を芯にした渦巻きに巻かれている。開くにつれて front が右へ進む
      float r0 = w * 0.11;
      float x = p.x + w * 0.5;
      float front = t * w;
      if (x > front) {
        float a = (x - front) / r0;
        // 内側ほど細く巻いて、何重にも重なって見せる
        float r = r0 * exp(-a * 0.07);
        x = front + r * sin(a);
        p.z = r0 - r * cos(a);
        normal = vec3(-sin(a), 0.0, cos(a));
      }
      float k = 1.0 - t;
      // 筒はカーソルの近くから転がり出す
      p.x = x - w * 0.5 + k * w * 0.35;
      // 斜めに傾いて手前に浮いたところから、開くにつれて正面に起き上がる
      p = rotateX(rotateY(p, -0.8 * k), 0.45 * k);
      normal = rotateX(rotateY(normal, -0.8 * k), 0.45 * k);
      p.z += k * w * 0.3;
    } else if (uClose > 0.0) {
      // 昔のテレビを切ったときのように、縦につぶれて横線になり、横線が点に縮んで消える
      float k1 = smoothstep(0.0, 0.5, uClose);
      float k2 = smoothstep(0.45, 1.0, uClose);
      p.y *= mix(1.0, 2.0 / uSize.y, k1 * k1);
      p.x *= mix(1.0 + 0.08 * k1, 0.004, k2 * k2);
    }
    vNormal = normal;

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
  uniform float uClose;
  uniform int uMode;
  varying vec2 vUv;
  varying vec3 vNormal;

  const vec3 LIGHT = vec3(-0.4, 0.7, 0.8);
  // 紙の裏の色
  const vec3 BACK = vec3(0.92, 0.93, 0.95);

  void main() {
    float t = uProgress;
    vec4 color = texture2D(uMap, vUv);

    if (uMode == 0) {
      // 巻かれた筒が円柱に見えるよう、光を当てる。正面を向いた面がちょうど元の明るさになるよう割る
      vec3 l = normalize(LIGHT);
      vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
      float diffuse = max(dot(n, l), 0.0) / l.z;
      float specular = pow(max(dot(n, normalize(l + vec3(0.0, 0.0, 1.0))), 0.0), 40.0);
      vec3 base = gl_FrontFacing ? color.rgb : BACK;
      vec3 lit = base * (0.35 + 0.65 * diffuse) + specular * 0.45 * (1.0 - t);
      gl_FragColor = vec4(lit, color.a * smoothstep(0.0, 0.08, t));
      return;
    }

    // 真ん中から四角く開く
    vec2 d = abs(vUv - 0.5) * 2.0;
    if (max(d.x, d.y) > t) discard;
    // 切るときは白く光って、点になってから消える
    vec3 rgb = mix(color.rgb, vec3(1.0), smoothstep(0.1, 0.5, uClose) * 0.9);
    gl_FragColor = vec4(rgb, color.a * (1.0 - smoothstep(0.85, 1.0, uClose)));
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
  // 知らない名前なら巻物にする
  const enterMode: EnterMode = ENTER_MODES.includes(mode as EnterMode)
    ? (mode as EnterMode)
    : 'roll'
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  } catch {
    return null
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  // 巻いた奥行きが見えるよう、遠近を付ける。z = 0 の面で 1 単位が 1px になる距離に置く
  const FOV = 30
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 10000)
  const uniforms = {
    uSize: { value: new THREE.Vector2(1, 1) },
    uVelocity: { value: new THREE.Vector2() },
    uMap: { value: null as THREE.Texture | null },
    uProgress: { value: 0 },
    uClose: { value: 0 },
    uMode: { value: ENTER_MODES.indexOf(enterMode) },
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
  // 四角を切るときの進み具合（0〜1）
  let close = 0
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
    if (active) open = Math.min(1, open + dt / ENTER[enterMode])
    else if (enterMode === 'rect') {
      // 切るときは開き具合をそのままにして、つぶす動きだけを進める
      close = Math.min(1, close + dt / CLOSE)
      if (close === 1) open = 0
    } else open = Math.max(0, open - dt / LEAVE)
    uniforms.uProgress.value = 1 - Math.pow(1 - open, 3)
    uniforms.uClose.value = close

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
      if (!active && close > 0) {
        // 切っている途中か切ったあとなら、もう一度はじめから開く
        open = 0
        close = 0
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
