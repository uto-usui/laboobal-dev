import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'processing-js-triangle',
  title: '三角形を描く',
  category: 'canvas',
  batch: 'F6',
  article: 'https://webmanab.com/lab/processing-js-triangle/',
  origin: 'https://jsfiddle.net/yutousui/x33ezzq7/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2016-08-29',
  added: '2026-11-04',
  description:
    '頂点を決めて描く三角形と、円を 3 等分する点を結んで描く三角形を重ねる。',
  tags: ['shape'],
  tech: ['canvas2d'],
  group: 'processing-js',
  variant: '三角',
})
