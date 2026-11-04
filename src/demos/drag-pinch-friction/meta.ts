import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'drag-pinch-friction',
  title: '引っぱると形と色が変わる',
  category: 'drag',
  batch: 'A',
  article: undefined,
  origin: 'laboobal/docs/basic/drag.md（basic/DragPinchFriction）',
  credits: [],
  webgl: false,
  interaction: 'drag',
  created: '2019-01-24',
  added: '2026-11-01',
  description:
    '引っぱると玉がのびて傾き、緑から赤へ色が変わる。離すと元の形で真ん中へ戻る。',
  tags: ['drag', 'physics'],
  tech: ['js'],
})
