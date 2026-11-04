import { fitCanvas, loop, onResize } from '../../shared/dom'
import { clamp } from '../../shared/math'
import { onReducedMotion } from '../../shared/motion'
import photo from './assets/photo.webp'

const stage = document.querySelector<HTMLElement>('.draw-image')!
const canvas = stage.querySelector<HTMLCanvasElement>('canvas')!
const label = stage.querySelector<HTMLElement>('.label')!
const ctx = canvas.getContext('2d')!

const image = new Image()
image.src = photo.src
await image.decode()

/** 走らせる速さ（px / 秒）。旧デモは 1 フレームに 1px */
const SCAN_SPEED = 90
const SHOW_SPEED = 240

let size = { width: 0, height: 0 }
/** 写真を画面いっぱいに切り取るときの、写真の側の範囲 */
let source = { x: 0, y: 0, width: 0, height: 0 }
let mode: 'scan' | 'show' = 'scan'
let x = 0
let direction = 1
let reduced = false
onReducedMotion((value) => (reduced = value))

const fitSource = () => {
  const view = size.width / size.height
  const ratio = image.naturalWidth / image.naturalHeight
  const width = view > ratio ? image.naturalWidth : image.naturalHeight * view
  const height = view > ratio ? image.naturalWidth / view : image.naturalHeight
  source = {
    x: (image.naturalWidth - width) / 2,
    y: (image.naturalHeight - height) / 2,
    width,
    height,
  }
}

/** 画面の x の位置にある写真の列を、left から right まで引き伸ばして描く */
const drawColumn = (column: number, left: number, right: number) => {
  const scale = source.width / size.width
  ctx.drawImage(
    image,
    source.x + column * scale,
    source.y,
    // 写真の側では 1 列分（画面の 1px にあたる幅）だけを切り出す
    scale,
    source.height,
    left,
    0,
    right - left,
    size.height,
  )
}

const setMode = (next: typeof mode) => {
  mode = next
  x = 0
  direction = 1
  label.textContent =
    mode === 'scan' ? 'クリックで写真を出す' : 'クリックで戻す'
}

loop((dt) => {
  if (mode === 'scan') {
    // 1 列を画面の幅いっぱいに引き伸ばす。どの列を使うかが左右に往復するので、縞が移り変わり続ける。
    // 動きを減らす設定の間は列を動かさず、縞を止めておく。クリックで写真を出すのは読む人が始めるので残す
    if (!reduced) x += direction * SCAN_SPEED * dt
    if (x >= size.width) direction = -1
    if (x <= 0) direction = 1
    x = clamp(x, 0, size.width)
    drawColumn(Math.floor(x), 0, size.width)
    return
  }
  if (x >= size.width) return
  // 左から 1 列ずつ本来の位置に描き、今の列は右の端まで伸ばす。描いた左側は消さずに残るので、写真が左から現れる
  const from = x
  x = Math.min(x + SHOW_SPEED * dt, size.width)
  const scale = source.width / size.width
  ctx.drawImage(
    image,
    source.x + from * scale,
    source.y,
    (x - from) * scale,
    source.height,
    from,
    0,
    x - from,
    size.height,
  )
  drawColumn(Math.floor(x), x, size.width)
})

onResize(stage, ({ width, height }) => {
  size = { width, height }
  fitCanvas(canvas, ctx)
  fitSource()
  // 出している途中で大きさが変わったら、左からやり直す
  if (mode === 'show') setMode('show')
})

stage.addEventListener('click', () =>
  setMode(mode === 'scan' ? 'show' : 'scan'),
)
setMode('scan')
