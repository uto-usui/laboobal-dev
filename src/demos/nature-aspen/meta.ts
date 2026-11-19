import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'nature-aspen',
  title: '風のあとに揺れる葉',
  category: 'webgpu',
  batch: 'new',
  article: undefined,
  origin: '新しく作ったデモ（参考: The Nature of Code 3 章）',
  credits: [],
  webgl: false,
  webgpu: true,
  // 横ドラッグの速さと向きが風圧になり、左右キーでも短い風を送れる。
  interaction: 'drag',
  created: '2026-11-19',
  added: '2026-11-19',
  description:
    '秋のアスペンの小枝を横になぞって風を送ると、葉が裏返り、1 枚ずつ違う周期で揺れ戻る。',
  tags: ['nature', 'physics', 'drag', '3d'],
  tech: ['webgpu', 'wgsl'],
  algorithm: [
    '角ばねと減衰振動',
    '半陰的 Euler 積分',
    '葉と葉柄の接触（距離の拘束）',
    '透過光（Beer–Lambert の法則）',
  ],
})
