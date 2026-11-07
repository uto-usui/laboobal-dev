import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'html-mizu-mikuji',
  title: '水占みくじ',
  category: 'hover',
  batch: 'new',
  article: undefined,
  origin: '新しく作ったデモ（もとのデモはない）',
  credits: [],
  webgl: true,
  interaction: 'hover',
  created: '2026-11-07',
  added: '2026-11-07',
  description:
    '石の水盤の底に、白紙のおみくじが並ぶ。手を近づけた側が持ち上がって水が寄り、水にひたした所だけ墨の文字がにじみ出る。水から出た札だけを結んだり持ち帰ったりできる。',
  tags: ['hover', 'physics', 'distortion', 'text', 'ui'],
  tech: ['glsl', 'js'],
})
