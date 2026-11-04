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
  created: '2019-10-29',
  added: '2026-11-01',
  description:
    '玉が集まった 1 枚の絵を深度の画像でずらし、マウスに合わせてのぞき込むように立体に見せる。',
  tags: ['image', '3d', 'cursor'],
  tech: ['three', 'glsl'],
  pick: true,
})
