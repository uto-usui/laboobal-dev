import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'canvas-fill-text',
  title: '円で埋める文字',
  category: 'canvas',
  batch: 'B2',
  article: undefined,
  origin: 'laboobal/docs/canvas/fillText.md',
  credits: [
    {
      label: 'The Coding Train',
      url: 'https://thecodingtrain.com/challenges/50-animated-circle-packing',
    },
  ],
  webgl: false,
  interaction: 'click',
  created: '2019-08-24',
  added: '2026-11-01',
  description:
    '大きな 1 文字の形の中に緑の線の円を置いて膨らませ、大小の円で埋める。クリックで別の文字になる。',
  tags: ['text', 'shape'],
  tech: ['canvas2d'],
})
