import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'amoeba',
  title: 'うごめくアメーバ',
  category: 'webgl',
  batch: 'current',
  article: undefined,
  origin: 'laboobal-dev/pages/amoeba（nuxt2-final）',
  credits: [],
  webgl: true,
  interaction: 'none',
  created: '2019-10-31',
  added: '2019-10-31',
  description:
    '黒い画面の真ん中で、縁がうねり続ける形が緑に光る。ノイズで形も光も変わり続ける。',
  tags: ['shape', 'noise'],
  tech: ['three', 'glsl'],
  pick: true,
})
