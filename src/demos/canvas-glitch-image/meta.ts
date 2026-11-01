import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'canvas-glitch-image',
  title: '震えて崩れる写真',
  category: 'webgl',
  batch: 'B2',
  article: undefined,
  origin: 'laboobal/docs/canvas/glitchImage.md',
  credits: [
    {
      label: 'ykob/sketch-threejs',
      url: 'https://github.com/ykob/sketch-threejs',
    },
  ],
  webgl: true,
  interaction: 'none',
})
