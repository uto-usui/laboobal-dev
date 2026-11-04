import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'mouse-tilt',
  title: 'マウスで傾ける',
  category: 'mouse',
  batch: 'A',
  article: undefined,
  origin: 'laboobal/docs/effects/mouse.md（effects/EffectsTilt）',
  credits: [],
  webgl: false,
  interaction: 'hover',
  created: '2018-08-21',
  added: '2026-11-01',
  description:
    '写真の上でマウスを動かすと、写真が板のように傾き、マウスのある側が奥へ沈む。',
  tags: ['cursor', 'image', '3d'],
  tech: ['gsap'],
})
