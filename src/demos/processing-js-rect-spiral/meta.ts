import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'processing-js-rect-spiral',
  title: '矩形を渦巻き状に描く',
  category: 'canvas',
  batch: 'F6',
  article: 'https://webmanab.com/lab/processing-js-rect-spiral/',
  origin: 'https://jsfiddle.net/yutousui/3c6v5rn5/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2016-08-31',
  added: '2026-11-04',
  description:
    '真ん中から測る角度と距離を少しずつ増やし、20 個の正方形を渦巻きに並べる。',
  tags: ['shape'],
  tech: ['canvas2d'],
})
