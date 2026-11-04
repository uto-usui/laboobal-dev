import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'processing-js-rect-in-a-circle',
  title: '矩形を円形に描く',
  category: 'canvas',
  batch: 'F6',
  article: 'https://webmanab.com/lab/processing-js-rect-in-a-circle/',
  origin: 'https://jsfiddle.net/yutousui/3nLbap1g/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2016-08-31',
  added: '2026-11-04',
  description:
    '正方形を描くたびに座標を進めて少し回し、20 個の正方形を輪のように並べる。',
  tags: ['shape'],
  tech: ['canvas2d'],
  group: 'processing-js',
  variant: '輪',
})
