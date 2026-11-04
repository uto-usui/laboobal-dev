import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'reveal-clip',
  title: '切り抜いて見せる',
  category: 'reveal',
  batch: 'A',
  article: undefined,
  origin: 'laboobal/docs/effects/reveal.md（effects/RevealClip）',
  credits: [],
  webgl: false,
  interaction: 'click',
  created: '2018-08-28',
  added: '2026-11-01',
  description:
    '写真が左から右へ、切り抜きが広がるように現れる。クリックするともう一度見られる。',
  tags: ['reveal', 'image'],
  tech: ['gsap', 'css'],
})
