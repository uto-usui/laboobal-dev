import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'distortion-slider-b',
  title: 'ゆがんで切り替わる（ずらし）',
  category: 'distortion',
  batch: 'A',
  article: undefined,
  origin: 'laboobal/docs/canvas/distortion.md（Canvas/DistortionSliderB）',
  credits: [],
  webgl: true,
  interaction: 'click',
  created: '2019-01-30',
  added: '2026-11-01',
  description:
    '写真が横に少しずれながら重なり、次の写真へ入れ替わる。クリックで切り替わる。',
  tags: ['slider', 'image', 'distortion'],
  tech: ['three', 'glsl', 'gsap'],
  group: 'distortion-slider',
  variant: 'ずらし',
})
