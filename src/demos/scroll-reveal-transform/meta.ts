import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'scroll-reveal-transform',
  title: 'スクロールで起き上がる',
  category: 'scroll',
  batch: 'A',
  article: undefined,
  origin: 'laboobal/docs/basic/scroll.md（basic/ScrollRevealTransform）',
  credits: [],
  webgl: false,
  interaction: 'scroll',
  created: '2019-01-21',
  added: '2026-11-01',
  description:
    'スクロールで通り過ぎる横長の箱が、奥へ倒れた形から起き上がり、上で手前へ倒れる。',
  tags: ['scroll', '3d'],
  tech: ['js'],
  group: 'scroll-reveal',
  variant: '起き上がる',
})
