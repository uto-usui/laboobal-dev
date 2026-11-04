import { fitCanvas, loop, onResize } from '../../shared/dom'
import { distance, pick, random } from '../../shared/math'

interface Circle {
  x: number
  y: number
  r: number
  growing: boolean
  color: string
}

const stage = document.querySelector<HTMLElement>('.fill-text')!
const canvas = stage.querySelector<HTMLCanvasElement>('canvas')!
const ctx = canvas.getContext('2d')!
const LETTERS = 'ABCDEFGHJKMNPRSUWXYZ'
const FONT = '700 100px Montserrat'
/** 1 フレームに試す新しい円の数 */
const TRIES = 10
/** 1 秒に半径が伸びる量（px）。旧デモは 1 フレームに 1px */
const GROW = 60

await document.fonts.load(FONT)

let size = { width: 0, height: 0 }
let spots: { x: number; y: number }[] = []
let circles: Circle[] = []
let letter = ''
let stopLoop: (() => void) | undefined

/** 文字を見えない canvas に書き、塗られた画素の位置を集める。円はこの位置からしか生まれない */
const collectSpots = (text: string) => {
  const { width, height } = size
  const mask = document.createElement('canvas')
  mask.width = Math.ceil(width)
  mask.height = Math.ceil(height)
  const maskCtx = mask.getContext('2d', { willReadFrequently: true })!
  const fontSize = Math.min(width * 0.75, height * 1.05)
  maskCtx.font = FONT.replace('100px', `${fontSize}px`)
  maskCtx.textAlign = 'center'
  maskCtx.textBaseline = 'middle'
  maskCtx.fillText(text, width / 2, height / 2 + fontSize * 0.04)
  const { data } = maskCtx.getImageData(0, 0, mask.width, mask.height)
  const found: { x: number; y: number }[] = []
  // 1px ずつ見ると多すぎるので 2px おき。円の位置としては十分に細かい
  for (let y = 0; y < mask.height; y += 2) {
    for (let x = 0; x < mask.width; x += 2) {
      if (data[(y * mask.width + x) * 4 + 3] > 128) found.push({ x, y })
    }
  }
  return found
}

const newColor = () =>
  `hsl(${170 + random(-15, 15)} ${70 + random(-50, 20)}% 55%)`

/** でたらめな位置に円を置いてみる。すでにある円の中なら置かない */
const trySpawn = () => {
  const spot = pick(spots)
  for (const circle of circles) {
    if (distance(circle.x, circle.y, spot.x, spot.y) <= circle.r + 1) return
  }
  circles.push({ ...spot, r: 1, growing: true, color: newColor() })
}

const draw = () => {
  ctx.clearRect(0, 0, size.width, size.height)
  ctx.lineWidth = 1
  for (const circle of circles) {
    ctx.strokeStyle = circle.color
    ctx.beginPath()
    ctx.arc(circle.x, circle.y, circle.r, 0, Math.PI * 2)
    ctx.stroke()
  }
}

/** 前と違う文字を選ぶ */
const pickLetter = () => {
  let next = letter
  while (next === letter) next = pick(LETTERS)
  return next
}

const start = (next = pickLetter()) => {
  stopLoop?.()
  letter = next
  spots = collectSpots(letter)
  circles = []
  let idle = 0

  stopLoop = loop((dt) => {
    const before = circles.length
    for (let i = 0; i < TRIES; i++) trySpawn()
    // 新しい円が置けない時間が続き、伸びている円もなくなったら止める
    idle = circles.length === before ? idle + dt : 0

    let growing = 0
    for (const circle of circles) {
      if (!circle.growing) continue
      // ほかの円に触れたら、その円はもう伸びない。触れるまでは文字の外へもはみ出す
      for (const other of circles) {
        if (
          other !== circle &&
          distance(circle.x, circle.y, other.x, other.y) < circle.r + other.r
        ) {
          circle.growing = false
          break
        }
      }
      if (circle.growing) {
        circle.r += GROW * dt
        growing++
      }
    }
    draw()
    if (idle > 1 && growing === 0) stopLoop?.()
  })
}

onResize(stage, ({ width, height }) => {
  if (width === size.width && height === size.height) return
  size = { width, height }
  fitCanvas(canvas, ctx)
  // 大きさが変わったら、同じ文字で詰め直す
  start(letter || undefined)
})

stage.addEventListener('click', () => start())
