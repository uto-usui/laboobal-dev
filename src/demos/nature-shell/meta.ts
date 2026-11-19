import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'nature-shell',
  title: '貝の縁に残る模様',
  category: 'webgpu',
  batch: 'new',
  article: undefined,
  origin: '新しく作ったデモ（参考: The Nature of Code 7 章）',
  credits: [],
  webgl: false,
  webgpu: true,
  interaction: 'click',
  created: '2026-11-19',
  added: '2026-11-19',
  description:
    '巻貝が育ちながら、縁で動く 1 列のセルの模様を殻に残していく。縁をタップすると、そこから新しい模様が広がる。',
  tags: ['nature', '3d', 'random'],
  tech: ['webgpu', 'wgsl'],
  algorithm: [
    '1 次元セル・オートマトン',
    '殻口が広がりながら巻く螺旋の成長曲面',
  ],
})
