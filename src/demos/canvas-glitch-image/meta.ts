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
  created: '2019-02-05',
  added: '2026-11-01',
  description:
    '白黒の写真がいつも細かく震え、数秒おきに一瞬、色がずれて筋とブロックで崩れる。',
  tags: ['image', 'distortion', 'noise'],
  tech: ['three', 'glsl'],
  pick: true,
})
