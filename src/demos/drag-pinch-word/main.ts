import { lambdaFromEase } from '../../shared/a/ease'
import { trackPull } from '../../shared/a/pull'
import { changeGate, loop, onResize } from '../../shared/dom'
import { damp, map, random } from '../../shared/math'
import { touchGate } from '../../shared/touch'
import type { Mount, Params } from '../../shared/variants'

export const params = {
  // もとは 60fps で書かれていて、1 フレームに差の 20% ずつ近づく
  ease: {
    label: '1 フレームで近づく割合',
    value: 0.2,
    min: 0.01,
    max: 0.5,
    step: 0.01,
  },
} satisfies Params

export const mount: Mount<typeof params> = (root, { ease }) => {
  const stage = root.querySelector<HTMLElement>('.stage')!
  const pull = trackPull(stage)
  const ungate = touchGate(stage)

  // 画面の真ん中から角までの長さ。ここまで引っぱると、いちばん大きくなる
  let reach = 1
  const unobserve = onResize(stage, ({ width, height }) => {
    reach = Math.hypot(width / 2, height / 2)
  })

  // 行ごとに引っぱりの効き方を変える。同じ操作で 5 行がばらばらに広がる
  const words = [...stage.querySelectorAll<HTMLElement>('.word')].map((el) => ({
    el,
    ratio: random(0.1, 1),
    x: 0,
    y: 0,
    changed: changeGate(),
  }))
  const lambda = lambdaFromEase(ease)

  const stop = loop((dt) => {
    for (const word of words) {
      word.x = damp(word.x, pull.x * word.ratio, lambda, dt)
      word.y = damp(word.y, pull.y * word.ratio, lambda, dt)
      // 毎フレーム font-size を書くとレイアウトが走る。止まっているときは書かない
      if (!word.changed(word.x, word.y, reach)) continue
      const distance = Math.hypot(word.x, word.y)
      word.el.style.letterSpacing = `${map(distance, 0, reach, 0.02, 3)}em`
      word.el.style.fontSize = `${map(distance, 0, reach, 1, 20)}em`
      word.el.style.height = `${50 + Math.abs(word.y) * 0.2}px`
    }
  })

  return () => {
    stop()
    unobserve()
    ungate()
    pull.dispose()
  }
}
