import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'canvas-shift-image',
  title: 'マウスで色をずらす',
  category: 'webgl',
  batch: 'B2',
  article: undefined,
  origin: 'laboobal/docs/canvas/shiftImage.md',
  credits: [],
  webgl: true,
  interaction: 'hover',
  created: '2019-08-23',
  added: '2026-11-01',
  description:
    '写真の赤・緑・青をずらし、マウスが端へ行くほど虹色ににじませる。',
  tags: ['image', 'distortion', 'cursor'],
  tech: ['three', 'glsl'],
})
