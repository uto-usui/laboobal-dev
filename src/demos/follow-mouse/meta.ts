import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'follow-mouse',
  title: 'マウスに遅れてついてくる',
  category: 'follow',
  batch: 'A',
  article: undefined,
  origin: 'laboobal/docs/basic/follow.md（basic/FollowMouse）',
  credits: [],
  webgl: false,
  interaction: 'hover',
  created: '2018-09-03',
  added: '2026-11-01',
  description:
    '大きい玉と小さい玉が、それぞれ少し遅れてマウスを追いかける。止めると同じ点に重なる。',
  tags: ['cursor'],
  tech: ['js'],
  group: 'follow-mouse',
  variant: '遅れて',
})
