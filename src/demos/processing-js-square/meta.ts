import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'processing-js-square',
  title: '矩形を描く',
  category: 'canvas',
  batch: 'F6',
  article: 'https://webmanab.com/lab/processing-js-square/',
  origin: 'https://jsfiddle.net/yutousui/qk8sc068/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2016-08-30',
  added: '2026-11-04',
  description:
    '太い線の長方形、角の丸い正方形、同じ数を rectMode の読み方を替えて描いた正方形を並べる。',
  tags: ['shape'],
  tech: ['canvas2d'],
})
