import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'move-a-node-with-springiness',
  title: 'ばねのように引き合うノード',
  category: 'canvas',
  batch: 'F6',
  article: 'https://webmanab.com/lab/move-a-node-with-springiness/',
  origin: 'https://jsfiddle.net/yutousui/x6buvc9o/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2017-12-05',
  added: '2026-11-04',
  description:
    '黒い画面で 50 個の点が壁に跳ね返りながら漂い、近づくと線で結ばれて引き合い、速さを増す。',
  tags: ['particles', 'physics'],
  tech: ['canvas2d'],
})
