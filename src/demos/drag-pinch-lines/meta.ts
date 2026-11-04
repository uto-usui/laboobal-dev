import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'drag-pinch-lines',
  title: '引っぱる向きにのびる線',
  category: 'drag',
  batch: 'A',
  article: undefined,
  origin: 'laboobal/docs/basic/drag.md（basic/DragPinchLines）',
  credits: [],
  webgl: false,
  interaction: 'drag',
  created: '2019-01-24',
  added: '2026-11-01',
  description:
    '引っぱると、散らばった 80 個の点が引っぱる向きの赤い線にのびる。離すと元に戻る。',
  tags: ['drag', 'particles'],
  tech: ['js'],
})
