import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'canvas-draw-image',
  title: '1 列を引き伸ばす',
  category: 'canvas',
  batch: 'B2',
  article: undefined,
  origin: 'laboobal/docs/canvas/drawImage.md',
  credits: [],
  webgl: false,
  interaction: 'click',
  created: '2021-02-08',
  added: '2026-11-01',
  description:
    '写真の 1 列を引き伸ばした縞の色が移ろう。クリックすると写真が縞を引きずって左から現れる。',
  tags: ['image', 'reveal'],
  tech: ['canvas2d'],
})
