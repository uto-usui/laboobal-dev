import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'rotate3d-xyz',
  title: '3 つの軸で回る点',
  category: '3d',
  batch: 'B1',
  article: undefined,
  origin: 'laboobal/docs/basic/rotate3d.md（basic/Rotate3dXYZ）',
  credits: [],
  webgl: false,
  interaction: 'hover',
  created: '2019-01-17',
  added: '2026-11-01',
  description:
    '赤、濃い緑、水色の 12 個の丸が 3 つの軸のまわりを回る。マウスで回る速さと向きが変わる。',
  tags: ['3d', 'cursor'],
  tech: ['js'],
})
