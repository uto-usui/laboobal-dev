import { changeGate, loop } from '../../shared/dom'
import { damp } from '../../shared/math'
import { lambdaFromEase } from '../../shared/a/ease'
import { trackPointer } from '../../shared/pointer'

const stage = document.querySelector<HTMLElement>('.stage')!
const pointer = trackPointer(stage, { units: 'px', touch: 'follow' })

// 大きい玉は差の 10%、小さい玉は 5% ずつ近づく。小さい方があとから来る
const balls = [0.1, 0.05].map((ease, i) => ({
  el: stage.querySelectorAll<HTMLElement>('.ball')[i],
  lambda: lambdaFromEase(ease),
  x: pointer.x,
  y: pointer.y,
  changed: changeGate(),
}))

loop((dt) => {
  for (const ball of balls) {
    ball.x = damp(ball.x, pointer.x, ball.lambda, dt)
    ball.y = damp(ball.y, pointer.y, ball.lambda, dt)
    if (!ball.changed(ball.x, ball.y)) continue
    ball.el.style.transform = `translate(${ball.x}px, ${ball.y}px) translate(-50%, -50%)`
  }
})
