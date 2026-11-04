import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'vue-todo',
  title: '簡単な TODO アプリケーション',
  category: 'ui',
  batch: 'F6',
  article: 'https://webmanab.com/lab/vue-todo/',
  origin: 'https://jsfiddle.net/yutousui/6t7780ua/2/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2017-08-22',
  added: '2026-11-04',
  description:
    'やることを書いて Add で足し、チェックを入れると線が引かれて、残りの数が減る小さな TODO リスト。',
  tags: ['ui', 'form'],
  tech: ['js'],
})
