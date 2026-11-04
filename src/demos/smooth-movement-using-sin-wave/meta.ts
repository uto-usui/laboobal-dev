import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'smooth-movement-using-sin-wave',
  title: 'サイン波を使ったスムーズな動き',
  category: 'trigonometry',
  batch: 'F6',
  article: 'https://webmanab.com/lab/smooth-movement-using-sin-wave/',
  origin: 'https://jsfiddle.net/yutousui/skrxqb9j/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2017-12-12',
  added: '2026-11-04',
  description:
    '箱が sin 波で左右になめらかに行き来し、端で速さを落としながら、位置に合わせて色を変える。',
  tags: ['shape', 'trigonometry'],
  tech: ['gsap'],
})
