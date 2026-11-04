import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'createjs-round-motion-trigonometric',
  title: 'sin の波に乗って進む丸',
  category: 'trigonometry',
  batch: 'F6',
  article: 'https://webmanab.com/lab/createjs-round-motion-trigonometric/',
  origin: 'https://jsfiddle.net/yutousui/4dL339yw/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2016-06-26',
  added: '2026-11-04',
  description:
    '灰色の丸が右へ進みながら sin で上下に揺れ、右の端まで行くと左から出直す。',
  tags: ['shape', 'trigonometry'],
  tech: ['canvas2d'],
  group: 'trigonometry',
  variant: '波に乗る丸',
})
