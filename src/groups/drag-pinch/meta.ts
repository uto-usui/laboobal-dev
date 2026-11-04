import { defineGroup } from '../../lib/demos'

export default defineGroup({
  name: 'drag-pinch',
  title: 'つまんで引っぱる',
  description:
    '画面のどこかを押して引っぱると、玉や線や文字が遅れてついてきて、離すと元に戻る。',
  variants: [
    'drag-pinch-simple',
    'drag-pinch-friction',
    'drag-pinch-lines',
    'drag-pinch-word',
  ],
  default: 'drag-pinch-lines',
})
