import { gsap } from '../../shared/gsap'
import { MotionPathPlugin } from 'gsap/MotionPathPlugin'
import { prefersReducedMotion } from '../../shared/dom'

gsap.registerPlugin(MotionPathPlugin)

const path = document.querySelector<SVGPathElement>('[data-path]')!
const trail = document.querySelector<SVGPathElement>('[data-trail]')!
const mover = document.querySelector<SVGRectElement>('[data-mover]')!

// 動くものも道と同じ svg の中に置いているので、svg が縮んでも一緒に縮み、道からずれない
gsap.set(mover, { transformOrigin: '50% 50%' })

const timeline = gsap.timeline({
  repeat: -1,
  yoyo: true,
  defaults: { duration: 10, ease: 'power2.inOut' },
})
timeline
  .to(mover, { motionPath: { path, autoRotate: true } }, 0)
  // 通ったところを同じ ease で塗る。線の伸び方で、端でゆっくり、真ん中で速いのが見える
  .to(trail, { attr: { 'stroke-dashoffset': 0 } }, 0)

if (prefersReducedMotion()) timeline.progress(0.5).pause()
