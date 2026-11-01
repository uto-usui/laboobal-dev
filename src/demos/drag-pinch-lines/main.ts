import { loop, onResize } from '../../shared/dom'
import { damp, map, random } from '../../shared/math'
import { lambdaFromEase } from '../../shared/a/ease'
import { trackPull } from '../../shared/a/pull'

const stage = document.querySelector<HTMLElement>('.stage')!
const ball = stage.querySelector<HTMLElement>('.ball')!
const pull = trackPull(stage)

let width = 0
let height = 0
onResize(stage, (size) => {
  width = size.width
  height = size.height
})

// 線ごとに、引っぱりの何倍で動くかを変える。同じ引っぱりでも、のび方と遅れ方がばらける
const lines = [...stage.querySelectorAll<HTMLElement>('.line')].map((el) => {
  // 画面の外まで少しはみ出して置く。端で線が途切れて見えないように
  el.style.left = `${random(-5, 105)}%`
  el.style.top = `${random(-5, 105)}%`
  return { el, ratio: random(0.25, 2), x: 0, y: 0 }
})
const lineLambda = lambdaFromEase(0.075)

const ballRatio = 0.5
const ballLambda = lambdaFromEase(0.1)
let ballX = 0
let ballY = 0

loop((dt) => {
  for (const line of lines) {
    line.x = damp(line.x, pull.x * line.ratio, lineLambda, dt)
    line.y = damp(line.y, pull.y * line.ratio, lineLambda, dt)
    const { x, y } = line
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
