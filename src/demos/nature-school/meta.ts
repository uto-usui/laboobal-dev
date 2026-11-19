import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'nature-school',
  title: 'イワシの群れ',
  category: 'webgpu',
  batch: 'new',
  article: undefined,
  origin: '新しく作ったデモ（参考: The Nature of Code 5 章）',
  credits: [],
  webgl: false,
  webgpu: true,
  interaction: 'hover',
  created: '2026-11-19',
  added: '2026-11-19',
  description:
    '青い海でイワシの群れに銀色の光の帯が走る。立体の捕食魚が自動で狩るモードと、カーソルや指を泳いで追うモードを切り替えられ、クリックやタップで群れが広がる。',
  tags: ['nature', 'particles', 'physics', '3d', 'cursor'],
  tech: ['webgpu', 'wgsl'],
  algorithm: [
    'Boids（Reynolds 1987）',
    '近い 7 匹に合わせる群れ（Ballerini ほか 2008）',
    '格子のハッシュと連結リストによる近所探し',
    'おびえの伝わり',
    '捕食魚の操舵（seek・pursue・arrive・wander）',
  ],
})
