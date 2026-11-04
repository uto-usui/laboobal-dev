import { scrollToTop } from '../../groups/scroll-reveal/scroll'
import { clamp } from '../../shared/math'
import { viewProgress } from '../../shared/a/view-progress'
import type { Mount } from '../../shared/variants'

export const mount: Mount = (stage) => {
  // CSS の scroll-driven animations が使えるブラウザでは、何もしない
  if (CSS.supports('animation-timeline: view()')) return scrollToTop

  const target = stage.querySelector<HTMLElement>('.target')!
  const update = () => {
    const progress = clamp(viewProgress(target, 100), 0, 1)
    target.style.setProperty('--p', String(progress))
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
