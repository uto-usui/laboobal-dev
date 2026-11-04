import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'scroll-reveal',
  title: 'スクロールの進み具合を数える',
  category: 'scroll',
  batch: 'A',
  article: undefined,
  origin: 'laboobal/docs/basic/scroll.md（basic/ScrollReveal）',
  credits: [],
  webgl: false,
  interaction: 'scroll',
  created: '2019-01-21',
  added: '2026-11-01',
  description:
    'スクロールで通り過ぎる緑の箱が、画面のどこまで来たかを 0〜1 の数で出す。',
  tags: ['scroll'],
  tech: ['js'],
})
