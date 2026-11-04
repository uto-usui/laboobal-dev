import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'drag-pinch-simple',
  title: 'つまんで離す',
  category: 'drag',
  batch: 'A',
  article: undefined,
  origin: 'laboobal/docs/basic/drag.md（basic/DragPinchSimple）',
  credits: [],
  webgl: false,
  interaction: 'drag',
  created: '2019-01-23',
  added: '2026-11-01',
  description:
    '画面のどこかを押して引っぱると、真ん中の玉が遅れて追いかけ、離すと戻る。',
  tags: ['drag', 'physics'],
  tech: ['js'],
  group: 'drag-pinch',
  variant: '玉',
})
