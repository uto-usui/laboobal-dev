import { onResize } from '../../shared/dom'
import { autoplayLoop } from '../../shared/motion'
import { damp, map, random, toRadian } from '../../shared/math'

const stage = document.querySelector<HTMLElement>('[data-stage]')!
const dots = [...stage.querySelectorAll<HTMLElement>('[data-dot]')]

interface Point {
  x: number
  y: number
  z: number
}

// 点の座標を原点のまわりに回す。要素そのものは回さないので、丸はいつもこちらを向いている
const rotateX = (p: Point, angle: number) => {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  ;[p.y, p.z] = [p.y * cos - p.z * sin, p.z * cos + p.y * sin]
}
const rotateY = (p: Point, angle: number) => {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  ;[p.x, p.z] = [p.x * cos - p.z * sin, p.z * cos + p.x * sin]
}
const rotateZ = (p: Point, angle: number) => {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  ;[p.x, p.y] = [p.x * cos - p.y * sin, p.y * cos + p.x * sin]
}

// 座標は画面の大きさ（unit）に対する割合で持つ。iframe の大きさが変わっても並びが崩れない
const points = dots.map((el) => ({
  el,
  x: random(-0.37, 0.37),
  y: random(-0.25, 0.25),
  z: random(-0.25, 0.25),
  // 1 秒に回る角度。点ごとに変えて、全体が 1 つの塊として回って見えないようにする
  speed: { x: random(60, 240), y: random(60, 240), z: random(60, 240) },
  scale: random(1, 2),
}))

let unit = 0
let width = 0
let height = 0
onResize(stage, (size) => {
  ;({ width, height } = size)
  unit = Math.min(height, width / 1.48)
  stage.style.setProperty('--unit', `${unit}px`)
  draw()
})

/**
 * マウスの位置で、X 軸と Y 軸のまわりの回る速さと向きを決める。真ん中で止まり、端へ行くほど速く、
 * 反対側へ行くと逆に回る。上下の動きが X 軸、左右の動きが Y 軸に効く。Z 軸のまわりはいつも回る
 */
const target = { x: -1.25, y: -1.25 }
const offset = { ...target }
stage.addEventListener('pointermove', (event) => {
  const rect = stage.getBoundingClientRect()
  target.x = map(event.clientY - rect.top, 0, rect.height, -1.25, 1.25)
  target.y = map(event.clientX - rect.left, 0, rect.width, -1.25, 1.25)
})

const draw = () => {
  // 大きさが分かるのは ResizeObserver が 1 回呼ばれてから
  if (!unit) return
  for (const p of points) {
    p.el.style.transform = `translate3d(${p.x * unit}px, ${p.y * unit}px, ${p.z * unit}px) scale(${p.scale})`
  }
  stage.dataset.ready = ''
}

// マウスを止めても回り続けるので、動きを減らす設定では止める
autoplayLoop((dt) => {
  // 1 フレームに差の 1 割ずつ近づく旧デモの追いつき方を、フレームレートによらない形にした
  offset.x = damp(offset.x, target.x, 6, dt)
  offset.y = damp(offset.y, target.y, 6, dt)
  for (const p of points) {
    rotateX(p, toRadian(p.speed.x * offset.x * dt))
    rotateY(p, toRadian(p.speed.y * offset.y * dt))
    rotateZ(p, toRadian(p.speed.z * dt))
  }
  draw()
})
