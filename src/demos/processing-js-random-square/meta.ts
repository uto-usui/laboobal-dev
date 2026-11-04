import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'processing-js-random-square',
  title: 'ランダムな大きさと色で矩形を描く',
  category: 'canvas',
  batch: 'F6',
  article: 'https://webmanab.com/lab/processing-js-random-square/',
  origin: 'https://jsfiddle.net/yutousui/nyeu0bu2/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2016-08-30',
  added: '2026-11-04',
  description:
    '大きさも色も位置もでたらめな半透明の正方形 300 個を、ループで散らす。開くたびに変わる。',
  tags: ['shape', 'random'],
  tech: ['canvas2d'],
  group: 'processing-js',
  variant: 'でたらめな四角',
})
