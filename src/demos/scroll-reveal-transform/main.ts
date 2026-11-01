import { loop } from '../../shared/dom'
import { damp, map } from '../../shared/math'
import { lambdaFromEase } from '../../shared/a/ease'
import { viewProgress } from '../../shared/a/view-progress'

// 動かす要素ではなく、動かさない親で測る。動かした位置で測ると、動きが進み具合に返ってくる
const slot = document.querySelector<HTMLElement>('.slot')!
const target = document.querySelector<HTMLElement>('.target')!

const lambda = lambdaFromEase(0.1)
const current = { scaleY: 1, rotateX: 60, y: 100 }

loop((dt) => {
  // 画面に入る 150px 手前から数え始める
  const progress = viewProgress(slot, -150)
  const goal = {
    // 真ん中で 1 倍、入り口と出口で少しのびる
    scaleY: map(Math.abs(progress - 0.5), 0, 0.5, 1, 1.1),
    // 下では奥へ倒れ、真ん中で起き上がり、上では手前へ倒れる
    rotateX: map(progress, 0, 1, 60, -60),
    y: map(progress, 0, 1, 100, -100),
  }
  // スクロールにぴったりではなく、少し遅れて追いつく
  current.scaleY = damp(current.scaleY, goal.scaleY, lambda, dt)
  current.rotateX = damp(current.rotateX, goal.rotateX, lambda, dt)
  current.y = damp(current.y, goal.y, lambda, dt)
  target.style.transform = `translateY(${current.y}px) rotateX(${current.rotateX}deg) scaleY(${current.scaleY})`

  // スクロールしても、いつも画面の真ん中から見ているようにする
  const slotTop = slot.getBoundingClientRect().top
  slot.style.perspectiveOrigin = `50% ${innerHeight / 2 - slotTop}px`
})
