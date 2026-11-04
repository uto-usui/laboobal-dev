import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'blob',
  title: '波打つ球',
  category: 'webgl',
  batch: 'current',
  article: undefined,
  origin: 'laboobal-dev/pages/blob（nuxt2-final）',
  credits: [],
  webgl: true,
  interaction: 'hover',
  created: '2019-07-16',
  added: '2026-11-01',
  description:
    '表面が波打ち続ける薄紫の球。マウスに遅れてついてきて、カメラが球のまわりへ回り込む。',
  tags: ['3d', 'shape', 'noise', 'cursor'],
  tech: ['three'],
})
