import { gsap } from '../../shared/gsap'
import { onResize } from '../../shared/dom'
import { autoplayLoop } from '../../shared/motion'
import { toRadian } from '../../shared/math'

const stage = document.querySelector<HTMLElement>('[data-stage]')!
const ring = document.querySelector<HTMLElement>('[data-ring]')!
const target = document.querySelector<HTMLElement>('[data-target]')!

// 1 秒に進む角度。もとは 1 フレームに 2 度（60fps で 120 度）
const SPEED = 120

let angle = 0
let center = { x: 0, y: 0 }
let radius = 0

/** 横を sin、縦を cos で動かすと、円の上を回る */
const draw = () => {
  const radian = toRadian(angle)
  gsap.set(target, {
    x: center.x + Math.sin(radian) * radius,
    y: center.y + Math.cos(radian) * radius,
  })
}

onResize(stage, ({ width, height }) => {
  center = {
    x: width / 2 - target.offsetWidth / 2,
    y: height / 2 - target.offsetHeight / 2,
  }
  radius = height / 4
  // 線の太さ 1px の分を足して、線の真ん中を玉の中心が通るようにする
  ring.style.setProperty('--diameter', `${radius * 2 + 1}px`)
  draw()
})

autoplayLoop((dt) => {
  angle += SPEED * dt
  draw()
}, draw)
