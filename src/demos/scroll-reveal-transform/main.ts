import { scrollToTop } from '../../groups/scroll-reveal/scroll'
import { changeGate, loop } from '../../shared/dom'
import { damp, map } from '../../shared/math'
import { lambdaFromEase } from '../../shared/a/ease'
import { viewProgress } from '../../shared/a/view-progress'
import type { Mount, Params } from '../../shared/variants'

export const params = {
  angle: { label: '倒れる角度', value: 60, min: 0, max: 90, step: 1 },
  // もとは 60fps で 1 フレームに差の 10% ずつ近づく
  ease: {
    label: '1 フレームに近づく割合',
    value: 0.1,
    min: 0.01,
    max: 1,
    step: 0.01,
  },
} satisfies Params

export const mount: Mount<typeof params> = (stage, { angle, ease }) => {
  // 動かす要素ではなく、動かさない親で測る。動かした位置で測ると、動きが進み具合に返ってくる
  const slot = stage.querySelector<HTMLElement>('.slot')!
  const target = stage.querySelector<HTMLElement>('.target')!

  const lambda = lambdaFromEase(ease)
  const current = { scaleY: 1, rotateX: angle, y: 100 }
  const targetChanged = changeGate()
  const originChanged = changeGate()

  const stop = loop((dt) => {
    // 読みを先に済ませてから書く。書いた直後に getBoundingClientRect を読むと、毎フレーム強制レイアウトになる
    // 画面に入る 150px 手前から数え始める
    const progress = viewProgress(slot, -150)
    const slotTop = slot.getBoundingClientRect().top
    const goal = {
      // 真ん中で 1 倍、入り口と出口で少しのびる
      scaleY: map(Math.abs(progress - 0.5), 0, 0.5, 1, 1.1),
      // 下では奥へ倒れ、真ん中で起き上がり、上では手前へ倒れる
      rotateX: map(progress, 0, 1, angle, -angle),
      y: map(progress, 0, 1, 100, -100),
    }
    // スクロールにぴったりではなく、少し遅れて追いつく
    current.scaleY = damp(current.scaleY, goal.scaleY, lambda, dt)
    current.rotateX = damp(current.rotateX, goal.rotateX, lambda, dt)
    current.y = damp(current.y, goal.y, lambda, dt)
    if (targetChanged(current.scaleY, current.rotateX, current.y))
      target.style.transform = `translateY(${current.y}px) rotateX(${current.rotateX}deg) scaleY(${current.scaleY})`

    // スクロールしても、いつも画面の真ん中から見ているようにする
    if (originChanged(slotTop, innerHeight))
      slot.style.perspectiveOrigin = `50% ${innerHeight / 2 - slotTop}px`
  })
  return () => {
    stop()
    scrollToTop()
  }
}
