import { changeGate, loop } from '../../shared/dom'
import { damp } from '../../shared/math'
import { lambdaFromEase } from '../../shared/a/ease'
import { trackPointer } from '../../shared/pointer'
import type { Mount, Params } from '../../shared/variants'

// 1 フレームで差のどれだけ近づくか。大きい光は 10%、小さい光は 8%。2 つがずれて、光の形が動きに合わせて変わる
export const params = {
  big: {
    label: '大きい光の近づく割合',
    value: 0.1,
    min: 0.01,
    max: 0.9,
    step: 0.01,
  },
  small: {
    label: '小さい光の近づく割合',
    value: 0.08,
    min: 0.01,
    max: 0.9,
    step: 0.01,
  },
} satisfies Params

export const mount: Mount<typeof params> = (main, { big, small }) => {
  const stage = main.querySelector<HTMLElement>('.stage')!
  const pointer = trackPointer(stage, { units: 'px', touch: 'follow' })

  const lights = [big, small].map((ease, i) => ({
    el: stage.querySelectorAll<HTMLElement>('.light')[i],
    lambda: lambdaFromEase(ease),
    x: pointer.x,
    y: pointer.y,
    changed: changeGate(),
  }))

  const stop = loop((dt) => {
    for (const light of lights) {
      light.x = damp(light.x, pointer.x, light.lambda, dt)
      light.y = damp(light.y, pointer.y, light.lambda, dt)
      if (!light.changed(light.x, light.y)) continue
      light.el.style.transform = `translate(${light.x}px, ${light.y}px) translate(-50%, -50%)`
    }
  })

  return () => {
    stop()
    pointer.dispose()
  }
}
