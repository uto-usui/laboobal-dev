import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'html-sticker',
  title: '箱のシールを剥がす',
  category: 'drag',
  batch: 'new',
  article: undefined,
  origin: '新しく作ったデモ（参考: NOCTURNAL）',
  credits: [],
  webgl: true,
  interaction: 'drag',
  created: '2026-11-12',
  added: '2026-11-12',
  description:
    '段ボール箱に貼った宛名ラベルやこわれもののシールを、本物の HTML のまま角からめくる。めくった所は筒に巻きついて裏の白が見え、離すと貼り戻って角が小さく跳ねる。',
  tags: ['drag', 'physics', 'form', 'ui'],
  tech: ['glsl', 'js'],
})
