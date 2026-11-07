import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'html-cloth',
  title: 'HTML の布をつまむ',
  category: 'drag',
  batch: 'new',
  article: undefined,
  origin: '新しく作ったデモ（もとのデモはない）',
  credits: [],
  webgl: true,
  interaction: 'drag',
  created: '2026-11-06',
  added: '2026-11-07',
  description:
    '本物の HTML を布のように描き、余白をつまむと持ち上がってしわが寄り、離すと机に戻る。欄に書いた文字は布が揺れている間もそのまま写る。',
  tags: ['drag', 'physics', 'form', 'ui'],
  tech: ['glsl', 'js'],
})
