import { clamp } from '../../shared/math'
import { viewProgress } from '../../shared/a/view-progress'

const target = document.querySelector<HTMLElement>('.target')!
const value = target.querySelector('.value')!
const bar = target.querySelector<HTMLElement>('.bar')!

const update = () => {
  // 画面の下から 100px 入ったところで数え始める
  const progress = clamp(viewProgress(target, 100), 0, 1)
  value.textContent = progress.toFixed(3)
  bar.style.transform = `scaleX(${progress})`
}

addEventListener('scroll', update, { passive: true })
addEventListener('resize', update)
update()
