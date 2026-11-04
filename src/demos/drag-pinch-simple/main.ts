import { lambdaFromEase } from '../../shared/a/ease'
import { trackPull } from '../../shared/a/pull'
import { changeGate, loop } from '../../shared/dom'
import { damp } from '../../shared/math'
import { touchGate } from '../../shared/touch'
import type { Mount, Params } from '../../shared/variants'

export const params = {
  // もとは 60fps で書かれていて、1 フレームに差の 10% ずつ近づく
  ease: {
    label: '1 フレームで近づく割合',
    value: 0.1,
    min: 0.01,
    max: 0.5,
    step: 0.01,
  },
} satisfies Params

export const mount: Mount<typeof params> = (root, { ease }) => {
  const stage = root.querySelector<HTMLElement>('.stage')!
  const ball = stage.querySelector<HTMLElement>('.ball')!

  const pull = trackPull(stage)
  const ungate = touchGate(stage)
  const lambda = lambdaFromEase(ease)
  let x = 0
  let y = 0
  const changed = changeGate()

  const stop = loop((dt) => {
    // 引っぱっている間は指の位置へ、離したら 0（真ん中）へ、同じ減り方で近づく
    x = damp(x, pull.x, lambda, dt)
    y = damp(y, pull.y, lambda, dt)
    if (changed(x, y)) ball.style.translate = `${x}px ${y}px`
  })

  return () => {
    stop()
    ungate()
    pull.dispose()
  }
}
