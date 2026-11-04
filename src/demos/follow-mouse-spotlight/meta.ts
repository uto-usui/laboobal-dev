import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'follow-mouse-spotlight',
  title: 'マウスで照らす',
  category: 'follow',
  batch: 'A',
  article: undefined,
  origin: 'laboobal/docs/basic/follow.md（basic/FollowMouseSpotLight）',
  credits: [],
  webgl: false,
  interaction: 'hover',
  created: '2019-02-08',
  added: '2026-11-01',
  description:
    '暗くした写真の上を、マウスについてくる光が照らす。光の当たった所だけ明るく見える。',
  tags: ['cursor', 'image'],
  tech: ['js'],
})
