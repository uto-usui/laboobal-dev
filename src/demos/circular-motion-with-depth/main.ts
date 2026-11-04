import { gsap } from '../../shared/gsap'
import { onResize } from '../../shared/dom'
import { autoplayLoop } from '../../shared/motion'
import { toRadian } from '../../shared/math'

const stage = document.querySelector<HTMLElement>('[data-stage]')!
const target = document.querySelector<HTMLElement>('[data-target]')!

// 1 秒に進む角度。もとは 1 フレームに 2 度（60fps で 120 度）
const SPEED = 120
// 奥行きは横の振れ幅の 1.5 倍
const DEPTH = 1.5

let angle = 0
let center = { x: 0, y: 0 }
let radius = 0

/** 上から見ると円を描く。横は sin、奥行きは cos */
const draw = () => {
  const radian = toRadian(angle)
  gsap.set(target, {
    x: center.x + Math.sin(radian) * radius,
    y: center.y,
    z: Math.cos(radian) * radius * DEPTH,
  })
}

onResize(stage, ({ width, height }) => {
  center = {
    x: width / 2 - target.offsetWidth / 2,
    y: height / 2 - target.offsetHeight / 2,
  }
  radius = height / 2
  // 手前に来たときに perspective を越えると、箱が目の後ろに回って消える。大きな画面では perspective を広げて、手前でも 2 倍の大きさまでにする
  stage.style.perspective = `${Math.max(500, radius * DEPTH * 2)}px`
  draw()
})

// 動きを減らす設定では、そのときの位置で止める
autoplayLoop((dt) => {
  angle += SPEED * dt
  draw()
}, draw)
