import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'processing-js-circle-at-the-mouse-position',
  title: 'マウスの位置に円を描く',
  category: 'canvas',
  batch: 'F6',
  article:
    'https://webmanab.com/lab/processing-js-circle-at-the-mouse-position/',
  origin: 'https://jsfiddle.net/yutousui/14w0mxjx/',
  credits: [],
  webgl: false,
  interaction: 'hover',
  created: '2016-08-31',
  added: '2026-11-04',
  description:
    'マウスの位置に青い半透明の円を描き重ねる。押すと暗くなり、離すと消えて描き直せる。',
  tags: ['cursor', 'shape'],
  tech: ['canvas2d'],
})
