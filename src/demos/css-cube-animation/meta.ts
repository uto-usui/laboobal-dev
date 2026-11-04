import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'css-cube-animation',
  title: 'CSS で立方体をつくって回転のアニメーションをあたえる',
  category: 'css',
  batch: 'F6',
  article: 'https://webmanab.com/lab/css-cube-animation/',
  origin: 'https://jsfiddle.net/yutousui/gre2a7tm/',
  credits: [],
  webgl: false,
  interaction: 'hover',
  created: '2015-12-08',
  added: '2026-11-04',
  description:
    'CSS の transform で組んだ 3 つの立方体。マウスを乗せると手前に飛び出しながら 1 回転する。',
  tags: ['3d', 'hover'],
  tech: ['css'],
})
