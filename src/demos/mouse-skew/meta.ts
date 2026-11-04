import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'mouse-skew',
  title: 'マウスでゆがませる',
  category: 'mouse',
  batch: 'A',
  article: undefined,
  origin: 'laboobal/docs/effects/mouse.md（effects/EffectsSkew）',
  credits: [],
  webgl: false,
  interaction: 'hover',
  created: '2018-08-21',
  added: '2026-11-01',
  description:
    '写真の上でマウスを動かすと、写真がマウスの方へ寄りながらひしゃげる。',
  tags: ['cursor', 'image', 'distortion'],
  tech: ['gsap'],
})
