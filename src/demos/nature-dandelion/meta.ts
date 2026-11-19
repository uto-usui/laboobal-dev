import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'nature-dandelion',
  title: '風にほどける綿毛',
  category: 'webgpu',
  batch: 'new',
  article: undefined,
  origin: '新しく作ったデモ（参考: The Nature of Code 4 章）',
  credits: [],
  webgl: false,
  webgpu: true,
  interaction: 'hover',
  created: '2026-11-19',
  added: '2026-11-19',
  description:
    '綿毛のそばを横になぞると、息で外れた種が傘を上にしてゆっくり漂う。',
  tags: ['nature', 'particles', 'physics', '3d', 'cursor'],
  tech: ['webgpu', 'wgsl'],
  algorithm: [
    '粒子系（放出・寿命・入れ替え）',
    '格子の流体（移流と圧力射影）',
    '異方性のある空気抵抗',
  ],
})
