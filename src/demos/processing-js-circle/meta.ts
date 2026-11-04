import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'processing-js-circle',
  title: '円を描く',
  category: 'canvas',
  batch: 'F6',
  article: 'https://webmanab.com/lab/processing-js-circle/',
  origin: 'https://jsfiddle.net/yutousui/zfbL36h3/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2016-08-30',
  added: '2026-11-04',
  description:
    '楕円を 1 つと、同じ数を ellipseMode の 4 つの読み方で渡した円を、灰色の画面に描く。',
  tags: ['shape'],
  tech: ['canvas2d'],
  group: 'processing-js',
  variant: '円',
})
