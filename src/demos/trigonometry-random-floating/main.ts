import { onResize } from '../../shared/dom'
import { autoplayLoop } from '../../shared/motion'
import { map, random, toRadian } from '../../shared/math'

const stage = document.querySelector<HTMLElement>('[data-stage]')!
const ball = document.querySelector<HTMLElement>('[data-ball]')!

/**
 * x、y、z、色相、perspective を、それぞれ別の角度と速さの sin で動かす。速さは 1 秒に進む角度。
 * 速さの比がそろわないので、同じ軌道を二度となぞらない。x だけ逆向き
 */
const waves = {
  x: { angle: random(0, 360), speed: -72 * random(0.5, 2) },
  y: { angle: random(0, 360), speed: 228 * random(0.5, 2) },
  z: { angle: random(0, 360), speed: 126 * random(0.5, 2) },
  hue: { angle: random(0, 360), speed: 60 * random(0.5, 1.25) },
  perspective: { angle: random(0, 360), speed: 120 * random(0.5, 1.25) },
}
const sin = (wave: { angle: number }) => Math.sin(toRadian(wave.angle))

let width = 0
let height = 0
onResize(stage, (size) => {
  ;({ width, height } = size)
  draw()
})

const draw = () => {
  const radius = height / 3
  const perspective = map(sin(waves.perspective), -1, 1, 100, 1000)
  // perspective より手前に来ると見えなくなるので、近づける量に上限をつける
  const z = Math.min(sin(waves.z) * radius * 1.25, perspective * 0.5)
  stage.style.perspective = `${perspective}px`
  ball.style.transform = `translate3d(${sin(waves.x) * width * 0.28}px, ${sin(waves.y) * radius}px, ${z}px)`
  ball.style.backgroundColor = `hsl(${map(sin(waves.hue), -1, 1, 0, 259)} 80% 70%)`
}

autoplayLoop(
  (dt) => {
    for (const wave of Object.values(waves)) wave.angle += wave.speed * dt
    draw()
  },
  // 動きを減らす設定では、玉を真ん中に置いて止める。でたらめな角度のままだと、画面の外で止まることがある
  () => {
    for (const wave of [waves.x, waves.y, waves.z]) wave.angle = 0
    draw()
  },
)
