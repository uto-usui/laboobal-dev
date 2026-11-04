import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'hover-control',
  title: 'ホバーの動きを最後まで見せる',
  category: 'hover',
  batch: 'A',
  article: undefined,
  origin: 'laboobal/docs/basic/hover.md（basic/HoverControl）',
  credits: [],
  webgl: false,
  interaction: 'hover',
  created: '2019-01-21',
  added: '2026-11-01',
  description:
    'マウスを乗せると帯が左から赤く塗られ、すぐ外しても最後まで伸びきってから戻る。',
  tags: ['hover'],
  tech: ['gsap'],
})
