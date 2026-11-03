import GUI from 'lil-gui'
import { loop, onResize, prefersReducedMotion } from '../../shared/dom'
import { washCount, type Mode } from './assign'
import {
  createRenderer,
  Unsupported,
  type Particles,
  type Renderer,
} from './gpu'
import type { FromWorker, ToWorker } from './worker'
import photo1 from './assets/01.jpg?url'
import photo2 from './assets/02.jpg?url'
import photo3 from './assets/03.jpg?url'
import photo4 from './assets/04.jpg?url'
import photo5 from './assets/05.jpg?url'
import photo6 from './assets/06.jpg?url'

const PHOTOS = [photo1, photo2, photo3, photo4, photo5, photo6]

const stage = document.querySelector<HTMLElement>('.particle-photo')!
const canvas = stage.querySelector<HTMLCanvasElement>('.view')!
const strip = stage.querySelector<HTMLElement>('.strip')!
const addButton = strip.querySelector<HTMLButtonElement>('.add')!
const fileInput = stage.querySelector<HTMLInputElement>('input[type=file]')!
const errorBox = stage.querySelector<HTMLElement>('.error')!

const showError = (message: string) => {
  errorBox.textContent = message
  errorBox.hidden = false
  console.error(message)
}

// ---------- 設定 ----------
const P = {
  mode: 'transport' as Mode,
  keepColor: false,
  cw: 0.9,
  kick: 1.6,
  wave: 1.1,
  swell: 0,
  swellHold: 2.5,
  swellDur: 3,
  abstract: 0.3,
  flowFreq: 2.4,
  stretch: 1.4,
  sizeMul: 1.0,
  trail: 0.5,
  depth: 0.3,
  dof: 0.6,
  parallax: 1,
  bloom: 0.9,
  impasto: 1,
  shadow: 1,
  // 指で触る端末と画面の小さい端末（スマホ）は、GPU が非力なことが多いので少ない粒から始める
  count:
    matchMedia('(pointer: coarse)').matches ||
    Math.min(screen.width, screen.height) < 600
      ? 65536
      : 262144,
  night: false,
  auto: !prefersReducedMotion(),
}
type Range = [keyof typeof P, string, number, number, number]
const RANGES: Record<string, Range[]> = {
  遷移: [
    ['kick', '吹き飛ばしの強さ', 0, 5, 0.05],
    ['wave', '波が広がる時間 (秒)', 0, 3, 0.05],
    ['cw', '色の重み（色で運ぶ）', 0, 3, 0.05],
    ['swell', '変化中の抽象度（0 で使わない）', 0, 1, 0.01],
    ['swellHold', '変化中の抽象度を保つ時間 (秒)', 0, 10, 0.1],
    ['swellDur', '変化中の抽象度を戻す時間 (秒)', 0.3, 10, 0.1],
  ],
  絵: [
    ['abstract', '抽象度', 0, 1, 0.01],
    ['flowFreq', '流れの細かさ', 0.4, 8, 0.1],
    ['stretch', '筆の長さ', 0, 5, 0.05],
    ['sizeMul', '粒の大きさ', 0.3, 3, 0.05],
    ['trail', '残像', 0, 0.97, 0.01],
  ],
  奥行きと光: [
    ['depth', '奥行き', 0, 1, 0.01],
    ['dof', 'ぼけ', 0, 2, 0.01],
    ['parallax', '視差（マウス）', 0, 2, 0.01],
    ['bloom', '光のにじみ（夜）', 0, 3, 0.01],
    ['impasto', '絵の具の厚み（紙）', 0, 2, 0.01],
    ['shadow', '影（紙）', 0, 2, 0.01],
  ],
}
const MODES: Record<string, Mode> = {
  色で運ぶ: 'transport',
  近くへ: 'spatial',
  散らす: 'scatter',
}
const MODE_HINT: Record<Mode, string> = {
  transport:
    '位置と色の 5 次元で最適輸送を解き、似た色の粒が似た色の場所へ向かう',
  spatial: 'いまの場所から近い場所へ。色だけが移り変わる',
  scatter: 'ばらばらに入れ替える。いちばん派手に飛ぶ',
}

// ---------- 状態 ----------
let gpu: Renderer
let n = 0
let live = 0
let cur: Float32Array | null = null // いま GPU に載っている割り当て（8 float / 粒）
let aspect = 1.5
let aspectTo = 1.5
let tStart = -1e3
let prevTime = 0
let time = 0
let mouse: [number, number] = [1e3, 1e3]
let pressed = false
let ppu = 400
let seq = 0
let pendingOrigin: [number, number] = [0, 0]
let pixelSize = { w: 1, h: 1 }
const images: { id: number; button: HTMLButtonElement }[] = []
let currentId: number | null = null
let lastSwitch = 0
let nextImageId = 0

const alloc = (count: number) => {
  n = count
  gpu.alloc(count)
  cur = null
  live = 0
}

// 前の割り当て prev から next へ。粒ごとの出発時刻は origin からの距離で遅らせ、波として広げる
const startTransition = (next: Float32Array, origin: [number, number]) => {
  const prev = cur ?? next
  const p: Particles = {
    H0: new Float32Array(n * 4),
    H1: new Float32Array(n * 4),
    C0: new Float32Array(n * 4),
    C1: new Float32Array(n * 4),
    M: new Float32Array(n * 4),
  }
  let maxD = 1e-6
  for (let i = 0; i < n; i++)
    maxD = Math.max(
      maxD,
      Math.hypot(prev[i * 8] - origin[0], prev[i * 8 + 1] - origin[1]),
    )
  for (let i = 0; i < n; i++) {
    const o = i * 8
    const q = i * 4
    p.H0.set(prev.subarray(o, o + 4), q)
    p.H1.set(next.subarray(o, o + 4), q)
    const d = Math.hypot(prev[o] - origin[0], prev[o + 1] - origin[1]) / maxD
    p.C0.set(prev.subarray(o + 4, o + 7), q)
    p.C0[q + 3] = d * P.wave + Math.random() * 0.18
    p.C1.set(next.subarray(o + 4, o + 8), q)
    p.M[q] = prev[o + 7]
    p.M[q + 1] = Math.random()
  }
  gpu.upload(p)
  cur = next
  live = n
  tStart = time + 0.001
}

// ---------- Worker ----------
const worker = new Worker(new URL('./worker.ts', import.meta.url), {
  type: 'module',
})
const send = (message: ToWorker, transfer: Transferable[] = []) =>
  worker.postMessage(message, transfer)
worker.onmessage = ({ data: m }: MessageEvent<FromWorker>) => {
  if (m.type === 'error') return showError(`worker: ${m.message}`)
  if (m.seq !== seq || m.data.length !== n * 8) return
  aspectTo = m.aspect
  currentId = m.id
  for (const image of images) {
    image.button.classList.toggle('is-current', image.id === m.id)
    image.button.classList.remove('is-busy')
  }
  startTransition(m.data, m.fresh ? [0, 0] : pendingOrigin)
}

const randomOrigin = (): [number, number] => [
  (Math.random() - 0.5) * 0.3,
  (Math.random() - 0.5) * 0.3,
]
const go = (id: number | null | undefined, origin = randomOrigin()) => {
  if (id == null) return
  pendingOrigin = origin
  lastSwitch = performance.now()
  images.find((image) => image.id === id)?.button.classList.add('is-busy')
  send({
    type: 'go',
    id,
    n,
    mode: P.mode,
    cw: P.cw,
    keepColor: P.keepColor,
    seq: ++seq,
  })
}
const nextImage = (origin?: [number, number]) => {
  if (!images.length) return
  const i = images.findIndex((image) => image.id === currentId)
  go(images[(i + 1) % images.length].id, origin)
}
const explode = (origin: [number, number] = [0, 0]) => {
  if (!cur) return
  pendingOrigin = origin
  startTransition(cur, origin)
}

const addImage = async (source: Blob, thumb: string, select = false) => {
  const bitmap = await createImageBitmap(source)
  const id = nextImageId++
  send({ type: 'add', id, bitmap }, [bitmap])
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute('aria-label', `${images.length + 1} 枚目の写真へ`)
  const img = document.createElement('img')
  img.alt = ''
  img.src = thumb
  button.append(img)
  button.addEventListener('click', () => go(id))
  strip.insertBefore(button, addButton)
  images.push({ id, button })
  if (select || (currentId == null && images.length === 1)) go(id)
}
const addFiles = async (files: Iterable<File>) => {
  let first = true
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    await addImage(file, URL.createObjectURL(file), first)
    first = false
  }
}

// ---------- 描画ループ ----------
const U = new Float32Array(40)
const cam = [0, 0]
const smooth = (x: number) => {
  x = Math.min(1, Math.max(0, x))
  return x * x * (3 - 2 * x)
}
const frame = (rawDt: number) => {
  const dt = Math.min(1 / 30, rawDt)
  prevTime = time
  time += dt
  gpu.resize(pixelSize.w, pixelSize.h, P.night)
  aspect += (aspectTo - aspect) * Math.min(1, dt * 3)
  ppu = Math.min((canvas.width * 0.86) / aspect, canvas.height * 0.8)

  if (P.auto && images.length > 1 && performance.now() - lastSwitch > 8000)
    nextImage()

  // 遷移が始まると抽象度を 0.4 秒で swell まで上げ、swellHold 秒保ってから swellDur 秒かけて元の値へ戻す。
  // ばねが緩んで流れに乗った粒が、戻るときに渦を巻きながら次の絵へ集まる
  const st = time - tStart
  const swellEnv =
    st > 0
      ? smooth(st / 0.4) * (1 - smooth((st - 0.4 - P.swellHold) / P.swellDur))
      : 0
  const a = P.abstract + Math.max(0, P.swell - P.abstract) * swellEnv
  const spring = 70 - 62 * a
  // 視線はマウスへゆっくり寄せ、触っていないときは小さく揺らす
  const hovering = mouse[0] < 100
  const mx = hovering
    ? mouse[0] / Math.max(aspect, 1)
    : Math.sin(time * 0.21) * 0.3
  const my = hovering ? mouse[1] : Math.sin(time * 0.17 + 1) * 0.25
  cam[0] += (mx * 0.32 * P.parallax - cam[0]) * Math.min(1, dt * 2.5)
  cam[1] += (-my * 0.32 * P.parallax - cam[1]) * Math.min(1, dt * 2.5)
  const prog = (time - tStart) / (P.wave + 1.8)
  const env = prog > 0 && prog < 1 ? Math.sin(Math.PI * prog) ** 1.5 : 0
  const [qw, qh] = gpu.quarter
  // 並びは shaders.ts の struct U と同じ
  U.set([
    time, dt, tStart, live,
    mouse[0], mouse[1], 0.14, pressed ? 70 : 5,
    spring, 1.15 * Math.sqrt(spring), 0.04 + 2.4 * a ** 1.5, P.flowFreq,
    P.kick, 1.3 + P.wave * 0.3, prevTime, (0.02 + 0.8 * a) * spring * 0.02,
    pendingOrigin[0], pendingOrigin[1], (2 * ppu) / canvas.width, (-2 * ppu) / canvas.height,
    P.sizeMul, P.stretch, P.night ? 1 : 0, P.night ? 0.6 : 0.88,
    1 - P.trail, 14, 0.55 / ppu, qw,
    cam[0], cam[1], P.depth, P.dof,
    P.bloom, env, 2.4, qh,
    washCount(n), P.impasto, P.shadow, 0,
  ]) // prettier-ignore
  gpu.render(U, live, washCount(n), P.night)
}

// ---------- 入力 ----------
const toWorld = (cx: number, cy: number): [number, number] => {
  const rect = canvas.getBoundingClientRect()
  const dpr = canvas.width / rect.width
  return [
    ((cx - rect.left) * dpr - canvas.width / 2) / ppu,
    ((cy - rect.top) * dpr - canvas.height / 2) / ppu,
  ]
}

const bindInput = () => {
  canvas.addEventListener('pointermove', (e) => {
    mouse = toWorld(e.clientX, e.clientY)
  })
  canvas.addEventListener('pointerdown', (e) => {
    pressed = true
    mouse = toWorld(e.clientX, e.clientY)
    canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointerup', () => {
    pressed = false
  })
  canvas.addEventListener('pointerleave', () => {
    mouse = [1e3, 1e3]
    pressed = false
  })
  canvas.addEventListener('dblclick', (e) =>
    nextImage(toWorld(e.clientX, e.clientY)),
  )
  addEventListener('keydown', (e) => {
    if ((e.target as Element).closest('input, select, button')) return
    if (e.code === 'Space') {
      e.preventDefault()
      nextImage()
    }
    if (e.key === 'e' || e.key === 'E') explode()
  })
  addButton.addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', () => addFiles(fileInput.files ?? []))
  addEventListener('dragover', (e) => {
    e.preventDefault()
    stage.classList.add('is-dragging')
  })
  addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) stage.classList.remove('is-dragging')
  })
  addEventListener('drop', (e) => {
    e.preventDefault()
    stage.classList.remove('is-dragging')
    addFiles(e.dataTransfer?.files ?? [])
  })
  addEventListener('paste', (e) => addFiles(e.clipboardData?.files ?? []))
}

const buildGui = () => {
  const gui = new GUI({ title: '設定' })
  gui.close()
  const transition = gui.addFolder('遷移')
  const mode = transition.add(P, 'mode', MODES).name('運び方')
  const hint = () => (mode.domElement.title = MODE_HINT[P.mode])
  mode.onChange(hint)
  hint()
  transition
    .add(P, 'keepColor')
    .name('色を保ったまま並べ替える').domElement.title =
    '「色で運ぶ」と組み合わせると、前の写真の粒だけで次の写真を組み立てる'
  for (const [name, list] of Object.entries(RANGES)) {
    const folder = name === '遷移' ? transition : gui.addFolder(name)
    for (const [key, label, min, max, step] of list)
      folder.add(P, key, min, max, step).name(label)
  }
  const view = gui.addFolder('粒と表示')
  view
    .add(P, 'count', {
      '65,536 粒': 65536,
      '262,144 粒': 262144,
      '524,288 粒': 524288,
      '1,048,576 粒': 1048576,
    })
    .name('粒の数')
    .onChange(() => {
      alloc(P.count)
      go(currentId ?? images[0]?.id, [0, 0])
    })
  view
    .add(P, 'night')
    .name('夜')
    .onChange(() => {
      stage.classList.toggle('is-night', P.night)
      gpu.clear(P.night)
    })
  view
    .add(P, 'auto')
    .name('8 秒ごとに次の写真へ')
    .onChange(() => (lastSwitch = performance.now()))
  const actions = {
    explode: () => explode(),
    next: () => nextImage(),
  }
  view.add(actions, 'explode').name('吹き飛ばす (E)')
  view.add(actions, 'next').name('次へ (Space)')
}

// ---------- 起動 ----------
onResize(stage, ({ width, height }) => {
  const dpr = Math.min(devicePixelRatio || 1, 2)
  pixelSize = {
    w: Math.max(1, Math.floor(width * dpr)),
    h: Math.max(1, Math.floor(height * dpr)),
  }
})

try {
  gpu = await createRenderer(canvas, showError)
  gpu.resize(pixelSize.w, pixelSize.h, P.night)
  alloc(P.count)
  bindInput()
  buildGui()
  loop(frame)
  // 6 枚を一度に読み始め、足すのは並びの順にする（1 枚目は Demo.astro の preload で先に読んでいる）
  const blobs = PHOTOS.map((url) => fetch(url).then((res) => res.blob()))
  for (const [i, blob] of blobs.entries()) await addImage(await blob, PHOTOS[i])
} catch (error) {
  if (error instanceof Unsupported) stage.classList.add('is-unsupported')
  else showError(error instanceof Error ? error.message : String(error))
}
