import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'distortion-slider-d',
  title: 'ゆがんで切り替わる（縦）',
  category: 'distortion',
  batch: 'A',
  article: undefined,
  origin: 'laboobal/docs/canvas/distortion2.md（Canvas/DistortionSliderD）',
  credits: [],
  webgl: true,
  interaction: 'click',
  created: '2019-01-30',
  added: '2026-11-01',
  description:
    '写真が縦に溶けて垂れ落ち、その筋の中から次の写真が現れる。クリックで切り替わる。',
  tags: ['slider', 'image', 'distortion', 'noise'],
  tech: ['three', 'glsl', 'gsap'],
  group: 'distortion-slider',
  variant: '縦',
})
