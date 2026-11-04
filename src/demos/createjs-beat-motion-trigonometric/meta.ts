import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'createjs-beat-motion-trigonometric',
  title: 'sin で脈打つ丸',
  category: 'trigonometry',
  batch: 'F6',
  article: 'https://webmanab.com/lab/createjs-beat-motion-trigonometric/',
  origin: 'https://jsfiddle.net/yutousui/swsha6gf/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2016-06-26',
  added: '2026-11-04',
  description:
    '真ん中の灰色の丸が、sin で大きさを 0.5 倍から 1.5 倍まで変え、脈打つように伸び縮みする。',
  tags: ['shape', 'trigonometry'],
  tech: ['canvas2d'],
})
