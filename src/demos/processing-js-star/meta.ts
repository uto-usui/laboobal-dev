import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'processing-js-star',
  title: '星を描く',
  category: 'canvas',
  batch: 'F6',
  article: 'https://webmanab.com/lab/processing-js-star/',
  origin: 'https://jsfiddle.net/yutousui/te5e6jt6/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2016-08-31',
  added: '2026-11-04',
  description:
    '山と谷の頂点を交互に結んで、同じ色の星を 2 つ描く。色は開くたびに変わる。',
  tags: ['shape', 'random'],
  tech: ['canvas2d'],
})
