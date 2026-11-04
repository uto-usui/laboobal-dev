import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'createjs-revolution-trigonometric',
  title: 'sin と cos で公転する丸',
  category: 'trigonometry',
  batch: 'F6',
  article: 'https://webmanab.com/lab/createjs-revolution-trigonometric/',
  origin: 'https://jsfiddle.net/yutousui/74yzsoyj/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2016-06-26',
  added: '2026-11-04',
  description:
    '小さな丸が、cos で横、sin で縦の位置を決められ、薄い円の上をゆっくり回り続ける。',
  tags: ['shape', 'trigonometry'],
  tech: ['canvas2d'],
  group: 'trigonometry',
  variant: '公転',
})
