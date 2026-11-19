import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'nature-galaxy-tides',
  title: '銀河が尾を引く',
  category: 'webgpu',
  batch: 'new',
  article: undefined,
  origin: '新しく作ったデモ（参考: The Nature of Code 2 章）',
  credits: [],
  webgl: false,
  webgpu: true,
  interaction: 'drag',
  created: '2026-11-19',
  added: '2026-11-19',
  description:
    '二つの渦巻き銀河の小さい方をつかんで投げると、互いの重力で円盤が引き伸ばされ、光の尾ができる。',
  tags: ['nature', 'physics', 'shape', '3d'],
  tech: ['webgpu', 'wgsl'],
  algorithm: [
    '軟化した相互重力（n 体）',
    'Leapfrog 積分',
    '重力で運ばれる円盤のメッシュと、面積に応じた光',
  ],
})
