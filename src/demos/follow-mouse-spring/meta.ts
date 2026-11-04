import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'follow-mouse-spring',
  title: 'ばねでついてくる',
  category: 'follow',
  batch: 'A',
  article: undefined,
  origin: 'laboobal/docs/basic/follow.md（basic/FollowMouseSpring）',
  credits: [],
  webgl: false,
  interaction: 'hover',
  created: '2018-09-03',
  added: '2026-11-01',
  description:
    '2 つの玉がマウスを追う。大きい玉はばねのように行き過ぎて、揺れ戻りながら止まる。',
  tags: ['cursor', 'physics'],
  tech: ['js'],
})
