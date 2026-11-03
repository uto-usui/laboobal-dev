import { changeGate, loop } from '../../shared/dom'
import { damp } from '../../shared/math'
import { lambdaFromEase } from '../../shared/a/ease'
import { trackPull } from '../../shared/a/pull'

const stage = document.querySelector<HTMLElement>('.stage')!
const ball = stage.querySelector<HTMLElement>('.ball')!

const pull = trackPull(stage)
const lambda = lambdaFromEase(0.1)
let x = 0
let y = 0
const changed = changeGate()

loop((dt) => {
  // 引っぱっている間は指の位置へ、離したら 0（真ん中）へ、同じ減り方で近づく
  x = damp(x, pull.x, lambda, dt)
  y = damp(y, pull.y, lambda, dt)
  if (changed(x, y)) ball.style.translate = `${x}px ${y}px`
})
