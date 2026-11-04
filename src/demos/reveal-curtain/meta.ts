import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'reveal-curtain',
  title: '幕で隠して見せる',
  category: 'reveal',
  batch: 'A',
  article: undefined,
  origin: 'laboobal/docs/effects/reveal.md（effects/RevealCurtain）',
  credits: [],
  webgl: false,
  interaction: 'click',
  created: '2018-08-26',
  added: '2026-11-01',
  description:
    '右から伸びる色の幕が写真の場所を覆い、幕が縮むと写真が現れる。クリックでもう一度。',
  tags: ['reveal', 'image'],
  tech: ['gsap'],
})
