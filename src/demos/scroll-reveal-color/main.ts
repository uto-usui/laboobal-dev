import { clamp } from '../../shared/math'
import { viewProgress } from '../../shared/a/view-progress'

// CSS の scroll-driven animations が使えるブラウザでは、何もしない
if (!CSS.supports('animation-timeline: view()')) {
  const target = document.querySelector<HTMLElement>('.target')!
  const update = () => {
    const progress = clamp(viewProgress(target, 100), 0, 1)
    target.style.setProperty('--p', String(progress))
  }
  addEventListener('scroll', update, { passive: true })
  addEventListener('resize', update)
  update()
}
