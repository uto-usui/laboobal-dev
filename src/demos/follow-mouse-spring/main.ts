import { changeGate, loop } from '../../shared/dom'
import { trackPointer } from '../../shared/pointer'
import type { Mount, Params } from '../../shared/variants'

// power ひとつで、引っぱる強さ（power）と速さの残り方（power の 2 乗）の両方が決まる。1 にすると揺れが収まらない
export const params = {
  big: {
    label: '大きい玉の power',
    value: 0.8,
    min: 0.05,
    max: 0.95,
    step: 0.05,
  },
  small: {
    label: '小さい玉の power',
    value: 0.3,
    min: 0.05,
    max: 0.95,
    step: 0.05,
  },
} satisfies Params

// 旧デモの式は 1 フレームを 1 歩として書かれている。画面の速さに左右されないよう、60 分の 1 秒ずつ進める
const STEP = 1 / 60

export const mount: Mount<typeof params> = (main, { big, small }) => {
  const stage = main.querySelector<HTMLElement>('.stage')!
  const pointer = trackPointer(stage, { units: 'px', touch: 'follow' })

  const balls = [big, small].map((power, i) => ({
    el: stage.querySelectorAll<HTMLElement>('.ball')[i],
    power,
    x: pointer.x,
    y: pointer.y,
    vx: 0,
    vy: 0,
    changed: changeGate(),
  }))

  let rest = 0

  const stop = loop((dt) => {
    rest += dt
    while (rest >= STEP) {
      rest -= STEP
      for (const ball of balls) {
        ball.vx =
          (ball.vx + (pointer.x - ball.x) * ball.power) * ball.power ** 2
        ball.vy =
          (ball.vy + (pointer.y - ball.y) * ball.power) * ball.power ** 2
        ball.x += ball.vx
        ball.y += ball.vy
      }
    }
    for (const ball of balls) {
      if (!ball.changed(ball.x, ball.y)) continue
      ball.el.style.transform = `translate(${ball.x}px, ${ball.y}px) translate(-50%, -50%)`
    }
  })

  return () => {
    stop()
    pointer.dispose()
  }
}
