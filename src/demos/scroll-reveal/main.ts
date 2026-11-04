import { scrollToTop } from '../../groups/scroll-reveal/scroll'
import { clamp } from '../../shared/math'
import { viewProgress } from '../../shared/a/view-progress'
import type { Mount } from '../../shared/variants'

export const mount: Mount = (stage) => {
  const target = stage.querySelector<HTMLElement>('.target')!
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
  return () => {
    removeEventListener('scroll', update)
    removeEventListener('resize', update)
    scrollToTop()
  }
}
