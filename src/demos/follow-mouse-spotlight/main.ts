import { changeGate, loop } from '../../shared/dom'
import { damp } from '../../shared/math'
import { lambdaFromEase } from '../../shared/a/ease'
import { trackPointer } from '../../shared/pointer'

const stage = document.querySelector<HTMLElement>('.stage')!
const pointer = trackPointer(stage, { units: 'px', touch: 'follow' })

// 大きい光は差の 10%、小さい光は 8% ずつ近づく。2 つがずれて、光の形が動きに合わせて変わる
const lights = [0.1, 0.08].map((ease, i) => ({
  el: stage.querySelectorAll<HTMLElement>('.light')[i],
  lambda: lambdaFromEase(ease),
  x: pointer.x,
  y: pointer.y,
  changed: changeGate(),
}))

loop((dt) => {
  for (const light of lights) {
    light.x = damp(light.x, pointer.x, light.lambda, dt)
    light.y = damp(light.y, pointer.y, light.lambda, dt)
    if (!light.changed(light.x, light.y)) continue
    light.el.style.transform = `translate(${light.x}px, ${light.y}px) translate(-50%, -50%)`
  }
})
