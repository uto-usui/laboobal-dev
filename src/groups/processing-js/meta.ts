import { defineGroup } from '../../lib/demos'

export default defineGroup({
  name: 'processing-js',
  title: 'Processing.js のスケッチ',
  description:
    'Processing.js の練習で書いたスケッチを canvas 2D で描き直した。点と線から、図形、ループ、でたらめ、マウスまで。',
  variants: [
    'processing-js-line-and-point',
    'processing-js-circle',
    'processing-js-square',
    'processing-js-triangle',
    'processing-js-star',
    'processing-js-gradation-dot',
    'processing-js-rect-in-a-circle',
    'processing-js-rect-spiral',
    'processing-js-random-square',
    'processing-js-draw-countless-circles-draw-function',
    'processing-js-random-walk',
    'processing-js-circle-at-the-mouse-position',
  ],
  default: 'processing-js-circle-at-the-mouse-position',
})
