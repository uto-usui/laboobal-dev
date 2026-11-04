import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'follow-mouse-transform',
  title: '遅れた分だけふくらむ',
  category: 'follow',
  batch: 'A',
  article: undefined,
  origin: 'laboobal/docs/basic/follow.md（basic/FollowMouseTransform）',
  credits: [],
  webgl: false,
  interaction: 'hover',
  created: '2018-09-03',
  added: '2026-11-01',
  description:
    'マウスを追う玉が、置いていかれた分だけふくらみ、追いつくと元の大きさに戻る。',
  tags: ['cursor', 'physics'],
  tech: ['js'],
  group: 'follow-mouse',
  variant: 'ふくらむ',
})
