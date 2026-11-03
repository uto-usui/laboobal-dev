import { changeGate, loop } from '../../shared/dom'
import { damp, map } from '../../shared/math'
import { lambdaFromEase } from '../../shared/a/ease'
import { trackPull } from '../../shared/a/pull'

const stage = document.querySelector<HTMLElement>('.stage')!
const ball = stage.querySelector<HTMLElement>('.ball')!

const pull = trackPull(stage)
// 指の移動の半分しかついてこない。重いものを引っぱっている手ごたえになる
const ratio = 0.5
const lambda = lambdaFromEase(0.25)
let x = 0
let y = 0
const changed = changeGate()

loop((dt) => {
  x = damp(x, pull.x * ratio, lambda, dt)
  y = damp(y, pull.y * ratio, lambda, dt)
  if (!changed(x, y)) return

  const distance = Math.hypot(x, y)
  // x と y の積なので、斜めに引いたときだけ回る。向きは象限で変わる
  const rotate = x * y * (Math.PI / 180) * 0.1
  ball.style.transform = `translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${1 + Math.abs(x) * 0.002}, ${1 + Math.abs(y) * 0.002})`
  ball.style.setProperty('--t', String(map(distance, 0, 250, 0, 1)))
})
