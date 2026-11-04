import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'distortion-slider-a',
  title: 'ゆがんで切り替わる（斜め）',
  category: 'distortion',
  batch: 'A',
  article: undefined,
  origin: 'laboobal/docs/canvas/distortion.md（Canvas/DistortionSliderA）',
  credits: [],
  webgl: true,
  interaction: 'click',
  created: '2019-01-30',
  added: '2026-11-01',
  description:
    '写真が斜めに溶けて崩れ、その中から次の写真が組み上がる。クリックで切り替わる。',
  tags: ['slider', 'image', 'distortion', 'noise'],
  tech: ['three', 'glsl', 'gsap'],
  pick: true,
})
