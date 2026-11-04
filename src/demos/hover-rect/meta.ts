import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'hover-rect',
  title: 'ホバーの動きを最後まで見せる（格子）',
  category: 'hover',
  batch: 'A',
  article: undefined,
  origin: 'laboobal/docs/basic/hover.md（basic/HoverRect）',
  credits: [],
  webgl: false,
  interaction: 'hover',
  created: '2019-01-21',
  added: '2026-11-01',
  description:
    '並んだ緑の四角にマウスを乗せると、赤くなって一回り縮み、番号が大きくなる。',
  tags: ['hover'],
  tech: ['gsap'],
})
