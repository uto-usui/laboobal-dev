import { lambdaFromEase } from '../../shared/a/ease'
import { trackPull } from '../../shared/a/pull'
import { changeGate, loop, onResize } from '../../shared/dom'
import { damp, map, random } from '../../shared/math'
import { touchGate } from '../../shared/touch'
import type { Mount, Params } from '../../shared/variants'

const ballRatio = 0.5

export const params = {
  // もとは 60fps で書かれていて、1 フレームに線は差の 7.5%、玉は 10% ずつ近づく。線が少し遅れて流れてくる
  lineEase: {
    label: '線が 1 フレームで近づく割合',
    value: 0.075,
    min: 0.01,
    max: 0.5,
    step: 0.005,
  },
  ballEase: {
    label: '玉が 1 フレームで近づく割合',
    value: 0.1,
    min: 0.01,
    max: 0.5,
    step: 0.005,
  },
} satisfies Params

export const mount: Mount<typeof params> = (root, { lineEase, ballEase }) => {
  const stage = root.querySelector<HTMLElement>('.stage')!
  const ball = stage.querySelector<HTMLElement>('.ball')!
  const pull = trackPull(stage)
  const ungate = touchGate(stage)

  let width = 0
  let height = 0
  const unobserve = onResize(stage, (size) => {
    width = size.width
    height = size.height
  })

  // 線ごとに、引っぱりの何倍で動くかを変える。同じ引っぱりでも、のび方と遅れ方がばらける
  const lines = [...stage.querySelectorAll<HTMLElement>('.line')].map((el) => {
    // 画面の外まで少しはみ出して置く。端で線が途切れて見えないように
    el.style.left = `${random(-5, 105)}%`
    el.style.top = `${random(-5, 105)}%`
    return { el, ratio: random(0.25, 2), x: 0, y: 0, changed: changeGate() }
  })
  const lineLambda = lambdaFromEase(lineEase)

  const ballLambda = lambdaFromEase(ballEase)
  let ballX = 0
  let ballY = 0
  const ballChanged = changeGate()

  const stop = loop((dt) => {
    for (const line of lines) {
      line.x = damp(line.x, pull.x * line.ratio, lineLambda, dt)
      line.y = damp(line.y, pull.y * line.ratio, lineLambda, dt)
      const { x, y } = line
      if (!line.changed(x, y, height)) continue
      // 縦の線を、引っぱっている向きに倒す
      const angle = 90 + (Math.atan2(y, x) * 180) / Math.PI
      const length = 1 + (Math.abs(x) + Math.abs(y)) * 0.2
      line.el.style.transform = `translate(${x * 0.5}px, ${y * 0.5}px) rotate(${angle}deg) scaleY(${length})`
      line.el.style.setProperty(
        '--t',
        String(map(Math.hypot(x, y), 0, height / 4, 0, 1)),
      )
    }

    // 真ん中の玉は、引っぱるほど小さくなって遠ざかる
    ballX = damp(ballX, pull.x * ballRatio, ballLambda, dt)
    ballY = damp(ballY, pull.y * ballRatio, ballLambda, dt)
    if (!ballChanged(ballX, ballY, width, height)) return
    const t = map(
      Math.hypot(ballX, ballY),
      0,
      ((width + height) / 4) * ballRatio,
      0,
      1,
    )
    ball.style.transform = `translate(${ballX * 2}px, ${ballY * 2}px) scale(${1 - t})`
    ball.style.setProperty('--t', String(t))
  })

  return () => {
    stop()
    unobserve()
    ungate()
    pull.dispose()
  }
}
