import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'parallax-shifting-divided-background-by-mouse',
  title: '分割した背景をマウスに合わせてずらす',
  category: 'parallax',
  batch: 'F6',
  article:
    'https://webmanab.com/lab/parallax-shifting-divided-background-by-mouse/',
  origin: 'https://jsfiddle.net/yutousui/xban07vu/',
  credits: [],
  webgl: false,
  interaction: 'hover',
  created: '2017-12-01',
  added: '2026-11-01',
  description:
    '画面いっぱいの写真を横 5 本の帯に切り、マウスに合わせて帯ごとに左右へずらす。',
  tags: ['parallax', 'cursor', 'image'],
  tech: ['gsap'],
})
