import { changeGate, loop } from '../../shared/dom'
import { damp, distance, map } from '../../shared/math'
import { lambdaFromEase } from '../../shared/a/ease'
import { trackPointer } from '../../shared/pointer'

const stage = document.querySelector<HTMLElement>('.stage')!
const pointer = trackPointer(stage, { units: 'px', touch: 'follow' })

const balls = [0.1, 0.5].map((ease, i) => ({
  el: stage.querySelectorAll<HTMLElement>('.ball')[i],
  lambda: lambdaFromEase(ease),
  x: pointer.x,
  y: pointer.y,
  changed: changeGate(),
}))

loop((dt) => {
  for (const ball of balls) {
    ball.x = damp(ball.x, pointer.x, ball.lambda, dt)
    ball.y = damp(ball.y, pointer.y, ball.lambda, dt)
    // ふくらみはマウスとの距離と入れ物の幅で決まるので、それも比べる
    const width = stage.clientWidth
    if (!ball.changed(ball.x, ball.y, pointer.x, pointer.y, width)) continue
    // マウスに置いていかれている距離だけふくらむ。追いつくと元の大きさに戻る
    const lag = distance(pointer.x, pointer.y, ball.x, ball.y)
    const scale = map(lag, 0, width / 2, 1, 2)
    ball.el.style.transform = `translate(${ball.x}px, ${ball.y}px) translate(-50%, -50%) scale(${scale})`
  }
})
