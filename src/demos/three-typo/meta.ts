import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'three-typo',
  title: '溶ける文字',
  category: 'webgl',
  batch: 'B2',
  article: undefined,
  origin: 'laboobal/docs/canvas/three/typo.md',
  credits: [],
  webgl: true,
  interaction: 'none',
  created: '2019-08-28',
  added: '2026-11-01',
  description:
    '赤い大きな文字の一部が溶けたように横へ流れる。崩れる場所はゆっくり移っていく。',
  tags: ['text', 'distortion', 'noise'],
  tech: ['three', 'glsl', 'canvas2d'],
  pick: true,
})
