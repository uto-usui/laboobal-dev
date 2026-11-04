import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'tweenmax-visual-range-animation-class',
  title: '見えている間だけスクロールに合わせて動かす',
  category: 'scroll',
  batch: 'F6',
  article: 'https://webmanab.com/lab/tweenmax-visual-range-animation-class/',
  origin: 'https://jsfiddle.net/yutousui/j5tp2cw2/',
  credits: [],
  webgl: false,
  interaction: 'scroll',
  created: '2017-12-08',
  added: '2026-11-01',
  description:
    '縦に並んだ箱が画面に入るとふわっと出て、見えている間は中の写真がスクロールに合わせてずれる。',
  tags: ['scroll', 'parallax', 'image'],
  tech: ['gsap'],
})
