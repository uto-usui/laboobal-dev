import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'stroke-redraw',
  title: '手書きの線を描き直す',
  category: 'drag',
  batch: 'new',
  article: undefined,
  origin:
    '新しく作ったデモ（Ondo Collective のサイトの手書きの線を、clip に書いた仕組みから作り直した）',
  credits: [{ label: 'Ondo Collective', url: 'https://ondocollective.jp' }],
  webgl: true,
  interaction: 'drag',
  created: '2026-11-13',
  added: '2026-11-13',
  description:
    '長さの違う手書きの線が同時に描き終わり、自分で書き足した線も一緒に描き直される。',
  tags: ['drag', 'reveal'],
  tech: ['glsl', 'js'],
})
