import { changeGate, loop } from '../../shared/dom'
import { damp } from '../../shared/math'
import { lambdaFromEase } from '../../shared/a/ease'
import { trackPointer } from '../../shared/pointer'
import type { Mount, Params } from '../../shared/variants'

// 1 フレームで差のどれだけ近づくか。大きい玉は 10%、小さい玉は 5%。小さい方があとから来る
export const params = {
  big: {
    label: '大きい玉の近づく割合',
    value: 0.1,
    min: 0.01,
    max: 0.9,
    step: 0.01,
  },
  small: {
    label: '小さい玉の近づく割合',
    value: 0.05,
    min: 0.01,
    max: 0.9,
    step: 0.01,
  },
} satisfies Params

export const mount: Mount<typeof params> = (main, { big, small }) => {
  const stage = main.querySelector<HTMLElement>('.stage')!
  const pointer = trackPointer(stage, { units: 'px', touch: 'follow' })

  const balls = [big, small].map((ease, i) => ({
    el: stage.querySelectorAll<HTMLElement>('.ball')[i],
    lambda: lambdaFromEase(ease),
    x: pointer.x,
    y: pointer.y,
    changed: changeGate(),
  }))

  const stop = loop((dt) => {
    for (const ball of balls) {
      ball.x = damp(ball.x, pointer.x, ball.lambda, dt)
      ball.y = damp(ball.y, pointer.y, ball.lambda, dt)
      if (!ball.changed(ball.x, ball.y)) continue
      ball.el.style.transform = `translate(${ball.x}px, ${ball.y}px) translate(-50%, -50%)`
    }
  })

  return () => {
    stop()
    pointer.dispose()
  }
}
