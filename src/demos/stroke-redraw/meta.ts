import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'stroke-redraw',
  title: '手書きの線を描き直す',
  category: 'drag',
  batch: 'new',
  article: undefined,
  origin: '新しく作ったデモ（参考: Ondo Collective）',
  credits: [],
  webgl: true,
  interaction: 'drag',
  created: '2026-11-13',
  added: '2026-11-13',
  description:
    '図形がひと筆で次々に描かれ、ドラッグすると自分の線に置き換わってくり返し描き直される。',
  tags: ['drag', 'reveal'],
  tech: ['glsl', 'js'],
})
