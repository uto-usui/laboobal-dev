import { changeGate, isCoarsePointer, loop, onResize } from '../../shared/dom'
import { clamp, damp } from '../../shared/math'
import { autoplayLoop, onReducedMotion } from '../../shared/motion'
import { onRunningChange, whenVisible } from '../../shared/visibility'

const page = document.querySelector<HTMLElement>('.page')!
const screen = page.querySelector<HTMLElement>('.screen')!
const picture = page.querySelector<HTMLElement>('.picture')!
const scenes = [...page.querySelectorAll<HTMLElement>('[data-scene]')]
const snow = page.querySelector<HTMLCanvasElement>('.snow')!
const mode = page.querySelector<HTMLElement>('[data-mode]')!
const timecode = page.querySelector<HTMLElement>('[data-timecode]')!
const filter = page.querySelector<SVGFilterElement>('filter')!
const turbulence = filter.querySelector('feTurbulence')!
const displacement = filter.querySelector('feDisplacementMap')!
const [redOffset, blueOffset] = filter.querySelectorAll('feOffset')

// 写真の場面は画面 1 枚ぶんのスクロール、はじめと終わりのカードはその半分。
// タイムコードは画面 1 枚ぶんを 4 秒とし、25fps で数える
const SECONDS_PER_SCREEN = 4
const FPS = 25
// 続けて動かした量が画面の 0.8 枚を超え、速さが 1 秒に画面 1.4 枚を超えたら、早送りか巻き戻しになる
const MIN_RUN = 0.8
const MIN_SPEED = 1.4
// 止まってこれだけたったら、動かした量を数え直す
const STOP_RESET = 0.15
// 帯の位置（seed）を入れ替える間隔。もとのサイトの「4 フレームに 1 回」を時間に直した
const SHUFFLE = 4 / 60

// 場面ごとのカメラの動き。x と y は場面の終わりまでに振る量（画面の割合）、zoom は寄る量
const CAMERA = [
  { length: 0.5, x: 0, y: 0, zoom: 0 },
  { length: 1, x: 0.06, y: 0, zoom: 0.15 },
  { length: 1, x: -0.06, y: -0.04, zoom: 0.1 },
  { length: 1, x: 0.03, y: 0.05, zoom: 0.25 },
  { length: 1, x: 0, y: 0.02, zoom: 0.35 },
  { length: 0, x: 0, y: 0, zoom: 0 },
]
// 各場面が始まる時間（画面の枚数）
const STARTS = CAMERA.map((_, i) =>
  CAMERA.slice(0, i).reduce((sum, { length }) => sum + length, 0),
)
const TOTAL = STARTS.at(-1)!

const stamp = page.querySelector<HTMLElement>('[data-stamp]')!
stamp.textContent = new Date()
  .toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  .toUpperCase()
  .replace(/^(\w+) (\d+),/, '$1.$2')

// ノイズは画面の解像度ではなく、横 320px で書いて引き伸ばす。粒が粗く、ぼけて見える
const SNOW_WIDTH = 320
const snowCtx = snow.getContext('2d')!
snow.width = SNOW_WIDTH
let snowImage = snowCtx.createImageData(SNOW_WIDTH, snow.height)

let width = 0
let height = 0
let range = 0
onResize(screen, (size) => {
  width = size.width
  height = size.height
  // 場面は sticky の画面の中に重ねてあり、ページの高さに入らない。テープの長さだけページを伸ばす
  page.style.height = `${(TOTAL + 1) * height}px`
  range = TOTAL * height
  filter.setAttribute('width', String(width))
  filter.setAttribute('height', String(height))
  // 1 画素を横 2 : 縦 1 に引き伸ばす高さにする。粒が横に流れた筋に見える
  const rows = clamp(
    Math.round((SNOW_WIDTH / Math.max(width, 1)) * height * 2),
    40,
    640,
  )
  if (rows !== snow.height) {
    snow.height = rows
    snowImage = snowCtx.createImageData(SNOW_WIDTH, rows)
  }
  resetHistory()
})

const localScroll = () =>
  clamp(scrollY - (page.getBoundingClientRect().top + scrollY), 0, range)

/** 巻き戻しは画面いっぱいの粗いノイズ。早送りは、明るいノイズの帯が 2 本、下へ流れる */
const drawSnow = (bars: number | null) => {
  const { data } = snowImage
  const rows = snow.height
  for (let y = 0; y < rows; y++) {
    let base = 0
    let spark = 0.03
    if (bars === null) {
      // ときどき 1 行まるごと明るい筋を入れる
      base = Math.random() < 0.04 ? 120 : 0
    } else {
      const inBar = [bars, bars + 0.55].some(
        (top) => (y / rows - top + 2) % 1 < 0.07,
      )
      if (!inBar) spark = 0
      base = inBar ? 60 : 0
    }
    for (let x = 0; x < SNOW_WIDTH; x++) {
      const v =
        Math.random() < spark
          ? 255
          : base === 0 && bars !== null
            ? 0
            : Math.random() * 70 + base
      const i = (y * SNOW_WIDTH + x) * 4
      data[i] = data[i + 1] = data[i + 2] = v
      data[i + 3] = 255
    }
  }
  snowCtx.putImageData(snowImage, 0, 0)
}

// 強さは分けて持つ。止め方がそれぞれ違うため（操作についてくるもの、1 回きり、ひとりでに起きるもの）
let rewind = 0
let forward = 0
let cut = 0
let opening = 0
let idle = 0

let reduced = false
onReducedMotion((value) => {
  reduced = value
  if (value) opening = cut = 0
})

// 開いたときに一度だけ乱して、落ち着かせる
whenVisible(() => {
  if (!reduced) opening = 1
})

// いちばん上にいるあいだ、7〜12 秒ごとに短く乱れる
let idleWait = 7 + Math.random() * 5
let idleLeft = 0
autoplayLoop(
  (dt) => {
    if (lastScroll > 1) {
      idleLeft = 0
    } else if (idleLeft > 0) {
      idleLeft = Math.max(0, idleLeft - dt)
    } else if ((idleWait -= dt) <= 0) {
      idleLeft = 0.4
      idleWait = 7 + Math.random() * 5
    }
    idle = idleLeft > 0 ? 0.45 : 0
  },
  () => {
    idle = 0
    idleLeft = 0
  },
)

// 速さは loop の dt（0.1 秒で頭打ち）ではなく、実際の位置と時刻の差で測る
let lastScroll = localScroll()
let lastTime = performance.now()
let stillFor = 0
// 今の向き（上なら -1、下なら 1）で続けて動かした量と、その向きの速さ
let direction = 0
let run = 0
let speed = 0
// 画に使う時間（場面の数）。スクロールにぴったり合わせず少し遅らせて、止めても少し進む重さを出す
let time = lastScroll / Math.max(height, 1)
function resetHistory() {
  lastScroll = localScroll()
  lastTime = performance.now()
  run = 0
  speed = 0
}
onRunningChange((running) => {
  if (running) resetHistory()
})

const frameChanged = changeGate(0.5)
const cameraChanged = changeGate(0.0005)
let current = -1
let typed = -1
let shuffleLeft = 0
let barsTop = 0
let active = false
let shown = ''

loop((dt) => {
  const now = performance.now()
  const elapsed = Math.max((now - lastTime) / 1000, 1 / 240)
  const scroll = localScroll()
  const delta = scroll - lastScroll
  lastScroll = scroll
  lastTime = now

  if (delta !== 0) {
    const sign = Math.sign(delta)
    if (sign !== direction) {
      direction = sign
      run = 0
      speed = 0
    }
    run += Math.abs(delta)
    stillFor = 0
  } else if ((stillFor += elapsed) > STOP_RESET) {
    run = 0
  }
  // 今の向きの速さ（画面の枚数 / 秒）。スクロールはフレームごとに進み方がばらつくので、少しならす
  const along = height > 0 ? Math.abs(delta) / elapsed / height : 0
  speed = damp(speed, along, 12, elapsed)

  const fast = run > MIN_RUN * height && speed > MIN_SPEED
  const goal = fast ? clamp(0.35 + (speed - MIN_SPEED) * 0.25, 0, 1) : 0
  // 乱れは速く立ち上げ、ゆっくり引く
  const rewindGoal = direction < 0 ? goal : 0
  const forwardGoal = direction > 0 ? goal : 0
  rewind = damp(rewind, rewindGoal, rewindGoal > rewind ? 20 : 4, elapsed)
  forward = damp(forward, forwardGoal, forwardGoal > forward ? 20 : 6, elapsed)
  opening = Math.max(0, opening - dt / 0.9)
  cut = Math.max(0, cut - dt / 0.3)

  const target = height > 0 ? scroll / height : 0
  time = damp(time, target, 10, dt)
  if (Math.abs(time - target) < 0.0005) time = target
  let index = 0
  while (index < STARTS.length - 1 && time >= STARTS[index + 1] - 0.0001)
    index++
  const { length } = CAMERA[index]
  const progress = length > 0 ? clamp((time - STARTS[index]) / length, 0, 1) : 0

  // 場面が替わったら、録画を止めて撮り直したときのような短い乱れを入れる
  if (index !== current) {
    if (current >= 0 && !reduced) cut = 0.6
    scenes[current]?.removeAttribute('data-current')
    scenes[index].setAttribute('data-current', '')
    current = index
    typed = -1
  }

  // カメラをゆっくり寄せて振る。スクロールの量で決まるので、戻せば戻る
  const camera = CAMERA[index]
  const photo = scenes[index].querySelector<HTMLElement>('.photo')
  if (photo && cameraChanged(index, progress)) {
    photo.style.transform = `translate3d(${camera.x * progress * 100}%, ${camera.y * progress * 100}%, 0) scale(${1 + camera.zoom * progress})`
  }

  // 場面の名前は、ビデオカメラのタイトルのように 1 文字ずつ打つ。場面の 3 割までに打ち終える
  const label = scenes[index].querySelector<HTMLElement>('[data-label]')
  if (label) {
    const text = label.dataset.label!
    const count = Math.round(clamp(progress / 0.3, 0, 1) * text.length)
    if (count !== typed) {
      typed = count
      label.textContent = text.slice(0, count)
    }
  }

  const frames = Math.round(time * SECONDS_PER_SCREEN * FPS)
  if (frameChanged(frames)) timecode.textContent = formatTimecode(frames)

  const rewinding = rewind >= 0.01
  const forwarding = forward >= 0.01
  const status = rewinding ? '◀◀ REW' : forwarding ? '▶▶ FF' : '▶ PLAY'
  if (status !== shown) {
    shown = status
    mode.textContent = status
    screen.toggleAttribute('data-rewind', rewinding)
    screen.toggleAttribute('data-forward', forwarding)
  }

  // 早送りは巻き戻しより弱く、ずれは小さく、ノイズは帯にする
  let strength = Math.max(rewind, forward * 0.4, cut, opening, idle)
  if (strength < 0.01) strength = 0

  if (strength === 0) {
    if (active) {
      active = false
      picture.style.filter = ''
      picture.style.transform = ''
      snow.style.opacity = '0'
    }
    return
  }

  const coarse = isCoarsePointer()
  const first = !active
  active = true
  // 帯の位置を入れ替えるのは点滅にあたるので、動きを減らす設定では最初の形のまま止める
  shuffleLeft -= dt
  const shuffle = first || (!reduced && shuffleLeft <= 0)
  if (shuffle) shuffleLeft = SHUFFLE

  if (coarse) {
    // タッチの端末では SVG のフィルターが重いので、画面ごと左右にずらすだけにする
    if (shuffle || reduced) {
      const side = reduced ? 1 : Math.random() * 2 - 1
      picture.style.transform = `translate3d(${side * strength * width * 0.04}px, 0, 0)`
    }
  } else {
    if (shuffle && !first)
      turbulence.setAttribute('seed', String(Math.floor(Math.random() * 1000)))
    // feDisplacementMap は scale × (値 - 0.5) だけずらす。いちばん外の段で画面の幅の 6% まで
    displacement.setAttribute('scale', String(strength * width * 0.12))
    const split = strength * Math.max(4, width * 0.008)
    redOffset.setAttribute('dx', String(split))
    blueOffset.setAttribute('dx', String(-split))
    if (first) picture.style.filter = 'url(#vhs-rewind-filter)'
  }

  // 早送りの帯は 1 秒に画面の 0.9 ぶん下へ流れる
  const bars = forwarding && forward >= rewind ? barsTop : null
  if (!reduced) barsTop = (barsTop + dt * 0.9) % 1
  if (first || (shuffle && !reduced)) drawSnow(bars)
  snow.style.opacity = String(
    bars === null ? strength * 0.55 : 0.35 + forward * 0.45,
  )
})

function formatTimecode(frames: number) {
  const ff = frames % FPS
  const total = Math.floor(frames / FPS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}:${pad(ff)}`
}
