import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'toc',
  title: '見出しから目次を作る',
  category: 'ui',
  batch: 'F6',
  article: 'https://webmanab.com/lab/toc/',
  origin: 'https://jsfiddle.net/yutousui/n7gr16v6/',
  credits: [],
  webgl: false,
  interaction: 'scroll',
  created: '2017-01-25',
  added: '2026-11-02',
  description:
    '本文の見出しを拾って入れ子の目次を作る。項目を押すと、その見出しまでスクロールする。',
  tags: ['ui', 'scroll'],
  tech: ['js'],
})
