import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'processing-js-random-walk',
  title: 'ランダムウォーク',
  category: 'canvas',
  batch: 'F6',
  article: 'https://webmanab.com/lab/processing-js-random-walk/',
  origin: 'https://jsfiddle.net/yutousui/5xfqs4a0/',
  credits: [],
  webgl: false,
  interaction: 'none',
  created: '2016-09-01',
  added: '2026-11-04',
  description:
    '真ん中から出た 3 つの点が、毎フレーム上下左右のどれかへ 1 歩ずつ進み、通った跡を残す。',
  tags: ['random'],
  tech: ['canvas2d'],
  group: 'processing-js',
  variant: 'ランダムウォーク',
})
