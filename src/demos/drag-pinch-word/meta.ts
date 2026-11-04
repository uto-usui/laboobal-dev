import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'drag-pinch-word',
  title: '引っぱると広がる文字',
  category: 'drag',
  batch: 'A',
  article: undefined,
  origin: 'laboobal/docs/basic/drag.md（basic/DragPinchWord）',
  credits: [],
  webgl: false,
  interaction: 'drag',
  created: '2019-01-24',
  added: '2026-11-01',
  description:
    '引っぱると、緑の帯に並んだ「DRAG」の文字が大きくなり、字の間が広がる。離すと元に戻る。',
  tags: ['drag', 'text'],
  tech: ['js'],
})
