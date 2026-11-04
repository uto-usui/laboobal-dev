import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'distortion-slider-c',
  title: 'ゆがんで切り替わる（横）',
  category: 'distortion',
  batch: 'A',
  article: undefined,
  origin: 'laboobal/docs/canvas/distortion2.md（Canvas/DistortionSliderC）',
  credits: [],
  webgl: true,
  interaction: 'click',
  created: '2019-01-30',
  added: '2026-11-01',
  description:
    '写真が横に引き裂かれ、流れる筋の中から次の写真が現れる。クリックで切り替わる。',
  tags: ['slider', 'image', 'distortion', 'noise'],
  tech: ['three', 'glsl', 'gsap'],
})
