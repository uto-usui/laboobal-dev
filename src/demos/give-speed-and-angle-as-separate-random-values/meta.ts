import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'give-speed-and-angle-as-separate-random-values',
  title: 'スピードと角度を別々のランダムな sin 波で与える',
  category: 'trigonometry',
  batch: 'F6',
  article:
    'https://webmanab.com/lab/give-speed-and-angle-as-separate-random-values/',
  origin: 'https://jsfiddle.net/yutousui/L4806xs6/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2017-12-12',
  added: '2026-11-04',
  description:
    '灰色の箱が、縦・横・奥行きごとに違う速さの sin 波で、決まった道をなぞらずに漂う。',
  tags: ['3d', 'random', 'trigonometry'],
  tech: ['gsap'],
})
