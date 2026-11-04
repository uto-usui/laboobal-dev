import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'customize-easing-of-mouse-scroll',
  title: 'マウススクロールのイージングをカスタマイズする',
  category: 'scroll',
  batch: 'F6',
  article: 'https://webmanab.com/lab/customize-easing-of-mouse-scroll/',
  origin: 'https://jsfiddle.net/yutousui/pkme3arj/',
  credits: [],
  webgl: false,
  interaction: 'scroll',
  created: '2018-01-27',
  added: '2026-11-04',
  description:
    'ホイールで回すと、寿司の並んだページがすぐには止まらず、少し遅れてすうっと追いついて止まる。',
  tags: ['scroll'],
  tech: ['js'],
})
