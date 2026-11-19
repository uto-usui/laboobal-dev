import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'nature-snow-bough',
  title: '雪を落とす枝',
  category: 'webgpu',
  batch: 'new',
  article: undefined,
  origin: '新しく作ったデモ（参考: The Nature of Code 1 章）',
  credits: [],
  webgl: false,
  webgpu: true,
  interaction: 'drag',
  created: '2026-11-19',
  added: '2026-11-19',
  description:
    '雪の積もった松の枝を引いて離すと、枝がしなって跳ね返り、雪が崩れながら落ちる。',
  tags: ['nature', 'physics', 'drag', '3d'],
  tech: ['webgpu', 'wgsl', 'js'],
  algorithm: [
    '弾性棒（曲げとねじれ）',
    '支持面の接触・摩擦・付着と破断',
    '符号付き距離場のレイマーチによる雪',
  ],
})
