import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'nodeballs',
  title: 'ぶつかって弾く玉と線',
  category: 'canvas',
  batch: 'current',
  article: undefined,
  origin: 'laboobal-dev/pages/nodeBalls（nuxt2-final）',
  credits: [
    {
      label: 'CodePen mnmxmx/mEVxeg',
      url: 'https://codepen.io/mnmxmx/pen/mEVxeg',
    },
  ],
  webgl: false,
  interaction: 'none',
  created: '2019-05-31',
  added: '2019-05-31',
  description:
    '大きさと色の違う玉が漂い、近い玉どうしが線で結ばれる。ぶつかると弾き合う。',
  tags: ['particles', 'physics'],
  tech: ['canvas2d'],
  group: 'nodes',
  variant: '弾く玉',
})
