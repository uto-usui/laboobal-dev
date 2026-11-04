import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'processing-js-line-and-point',
  title: '点と線を描く',
  category: 'canvas',
  batch: 'F6',
  article: 'https://webmanab.com/lab/processing-js-line-and-point/',
  origin: 'https://jsfiddle.net/yutousui/d2y41xkn/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2016-08-30',
  added: '2026-11-04',
  description:
    '点と直線を描き、太い線では端の形を丸・切りっぱなし・伸ばすの 3 通りで見せる。',
  tags: ['shape'],
  tech: ['canvas2d'],
  group: 'processing-js',
  variant: '点と線',
})
