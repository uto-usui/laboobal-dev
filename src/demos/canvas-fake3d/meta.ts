import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'canvas-fake3d',
  title: '深度の画像で立体に見せる',
  category: 'webgl',
  batch: 'B2',
  article: undefined,
  origin: 'laboobal/docs/canvas/fake3d.md',
  credits: [
    { label: 'akella/fake3d', url: 'https://github.com/akella/fake3d' },
  ],
  webgl: true,
  interaction: 'hover',
})
