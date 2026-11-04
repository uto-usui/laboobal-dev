import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'createjs-node-motion',
  title: '引き合いながら漂う点と線',
  category: 'canvas',
  batch: 'F6',
  article: 'https://webmanab.com/lab/createjs-node-motion/',
  origin: 'https://jsfiddle.net/yutousui/grbz1m8q/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2017-03-01',
  added: '2026-11-04',
  description:
    '30 個の点が漂い、近い点どうしが線で結ばれて引き合う。端から出ると反対の端から戻る。',
  tags: ['particles', 'physics'],
  tech: ['canvas2d'],
  group: 'nodes',
  variant: '引き合う点',
})
