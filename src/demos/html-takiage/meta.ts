import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'html-takiage',
  title: '焚き上げの短冊',
  category: 'drag',
  batch: 'new',
  article: undefined,
  origin: '新しく作ったデモ（もとのデモはない）',
  credits: [],
  webgl: true,
  interaction: 'drag',
  created: '2026-11-07',
  added: '2026-11-07',
  description:
    '夜の社の焚き上げ所。和紙の短冊に手放したいことを縦書きで書き、綴じ目からちぎって篝火にくべると、書いた字ごと焦げて燃え、灰になって昇る。綴じ目には半券が残っていく。',
  tags: ['drag', 'physics', 'form', 'text', 'particles'],
  tech: ['glsl', 'js'],
})
