import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'count-textarea',
  title: 'テキストエリアの文字数を数える',
  category: 'form',
  batch: 'F6',
  article: 'https://webmanab.com/lab/count-textarea/',
  origin: 'https://jsfiddle.net/yutousui/58v2d54d/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2016-10-17',
  added: '2026-11-02',
  description: '入力欄に書いた文字の数を、書くたび消すたびに欄の右下へ出す。',
  tags: ['form', 'text'],
  tech: ['js'],
})
