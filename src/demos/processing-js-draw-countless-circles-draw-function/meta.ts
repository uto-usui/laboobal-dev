import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'processing-js-draw-countless-circles-draw-function',
  title: 'draw 関数で円を描き続ける',
  category: 'canvas',
  batch: 'F6',
  article:
    'https://webmanab.com/lab/processing-js-draw-countless-circles-draw-function/',
  origin: 'https://jsfiddle.net/yutousui/khdb9r0c/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2016-08-31',
  added: '2026-11-04',
  description:
    '横長の画面のでたらめな位置に、白い小さな円を毎フレーム 1 つずつ描き足していく。',
  tags: ['shape', 'random'],
  tech: ['canvas2d'],
})
