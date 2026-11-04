import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'rotate-elements-arranged-on-the-circumference',
  title: '円周上に並べた要素を回転させる',
  category: 'trigonometry',
  batch: 'F6',
  article:
    'https://webmanab.com/lab/rotate-elements-arranged-on-the-circumference/',
  origin: 'https://jsfiddle.net/yutousui/74uzrxL6/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2017-12-12',
  added: '2026-11-04',
  description:
    '円周に並んだ 12 枚の色の板が輪ごと回り、奥と手前を行き来しながら、それぞれ回転して大きさを変える。',
  tags: ['3d', 'trigonometry'],
  tech: ['gsap'],
  group: 'trigonometry',
  variant: '円周の 12 枚',
})
