import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'nature-grove',
  title: '林を植える',
  category: 'webgpu',
  batch: 'new',
  article: undefined,
  origin: '新しく作ったデモ（参考: The Nature of Code 8 章）',
  credits: [],
  webgl: false,
  webgpu: true,
  interaction: 'click',
  created: '2026-11-19',
  added: '2026-11-19',
  description:
    '地面をタップすると苗が植わり、枝葉を広げて若木に育つ。植えるたびに違う木になり、小さな林ができていく。',
  tags: ['nature', '3d', 'random'],
  tech: ['webgpu', 'wgsl'],
  algorithm: [
    '確率つき L-system',
    '芽の一斉書き換えによる成長',
    '深度シャドウマップ',
  ],
})
