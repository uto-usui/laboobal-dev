import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'processing-js-gradation-dot',
  title: 'グラデーションの水玉を描く',
  category: 'canvas',
  batch: 'F6',
  article: 'https://webmanab.com/lab/processing-js-gradation-dot/',
  origin: 'https://jsfiddle.net/yutousui/o6bfp7s1/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2016-08-30',
  added: '2026-11-04',
  description:
    '二重のループで 6×6 の水玉を並べ、列ごとに色相をずらして青緑から赤紫へ移す。',
  tags: ['shape'],
  tech: ['canvas2d'],
})
