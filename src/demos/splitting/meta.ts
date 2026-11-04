import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'splitting',
  title: '文字をばらして動かす',
  category: 'text',
  batch: 'current',
  article: undefined,
  origin: 'laboobal-dev/pages/splitting（nuxt2-final）',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2020-07-25',
  added: '2020-07-25',
  description:
    '見出しを 1 文字ずつに分け、左から順に上へ抜けて消し、逆再生で戻すのを繰り返す。',
  tags: ['text'],
  tech: ['gsap'],
})
