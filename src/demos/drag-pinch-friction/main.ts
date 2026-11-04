import { lambdaFromEase } from '../../shared/a/ease'
import { trackPull } from '../../shared/a/pull'
import { changeGate, loop } from '../../shared/dom'
import { damp, map } from '../../shared/math'
import { touchGate } from '../../shared/touch'
import type { Mount, Params } from '../../shared/variants'

export const params = {
  // 指の移動の半分しかついてこない。重いものを引っぱっている手ごたえになる
  ratio: {
    label: '指についてくる割合',
    value: 0.5,
    min: 0.1,
    max: 1,
    step: 0.05,
  },
  // もとは 60fps で書かれていて、1 フレームに差の 25% ずつ近づく
  ease: {
    label: '1 フレームで近づく割合',
    value: 0.25,
    min: 0.01,
    max: 0.5,
    step: 0.01,
  },
} satisfies Params

export const mount: Mount<typeof params> = (root, { ratio, ease }) => {
  const stage = root.querySelector<HTMLElement>('.stage')!
  const ball = stage.querySelector<HTMLElement>('.ball')!

  const pull = trackPull(stage)
  const ungate = touchGate(stage)
  const lambda = lambdaFromEase(ease)
  let x = 0
  let y = 0
  const changed = changeGate()

  const stop = loop((dt) => {
    x = damp(x, pull.x * ratio, lambda, dt)
    y = damp(y, pull.y * ratio, lambda, dt)
    if (!changed(x, y)) return

    const distance = Math.hypot(x, y)
    // x と y の積なので、斜めに引いたときだけ回る。向きは象限で変わる
    const rotate = x * y * (Math.PI / 180) * 0.1
    ball.style.transform = `translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${1 + Math.abs(x) * 0.002}, ${1 + Math.abs(y) * 0.002})`
    ball.style.setProperty('--t', String(map(distance, 0, 250, 0, 1)))
  })

  return () => {
    stop()
    ungate()
    pull.dispose()
  }
}
