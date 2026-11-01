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
})
