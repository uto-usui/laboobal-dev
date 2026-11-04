import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'create-js-line-motion-trigonometric-sin',
  title: 'sin で描く波の線',
  category: 'trigonometry',
  batch: 'F6',
  article: 'https://webmanab.com/lab/create-js-line-motion-trigonometric-sin/',
  origin: 'https://jsfiddle.net/yutousui/7s1wt0y1/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2017-03-01',
  added: '2026-11-04',
  description:
    'ペン先が右へ進みながら sin で上下に振れ、灰色の波の線を少しずつ描いていく。',
  tags: ['shape', 'trigonometry'],
  tech: ['canvas2d'],
})
