import { loop, onResize } from '../../shared/dom'
import { damp, map, random } from '../../shared/math'
import { lambdaFromEase } from '../../shared/a/ease'
import { trackPull } from '../../shared/a/pull'

const stage = document.querySelector<HTMLElement>('.stage')!
const pull = trackPull(stage)

// 画面の真ん中から角までの長さ。ここまで引っぱると、いちばん大きくなる
let reach = 1
onResize(stage, ({ width, height }) => {
  reach = Math.hypot(width / 2, height / 2)
})

// 行ごとに引っぱりの効き方を変える。同じ操作で 5 行がばらばらに広がる
const words = [...stage.querySelectorAll<HTMLElement>('.word')].map((el) => ({
  el,
  ratio: random(0.1, 1),
  x: 0,
  y: 0,
}))
const lambda = lambdaFromEase(0.2)

loop((dt) => {
  for (const word of words) {
    word.x = damp(word.x, pull.x * word.ratio, lambda, dt)
    word.y = damp(word.y, pull.y * word.ratio, lambda, dt)
    const distance = Math.hypot(word.x, word.y)
    word.el.style.letterSpacing = `${map(distance, 0, reach, 0.02, 3)}em`
    word.el.style.fontSize = `${map(distance, 0, reach, 1, 20)}em`
    word.el.style.height = `${50 + Math.abs(word.y) * 0.2}px`
  }
})
