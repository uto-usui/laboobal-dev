import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'noise-glitch',
  title: 'かたかた震えるグリッチエフェクト',
  category: 'text',
  batch: 'F6',
  article: 'https://webmanab.com/lab/noise-glitch/',
  origin: 'https://jsfiddle.net/yutousui/o5pp8s9f/',
  credits: [
    {
      label: 'codrops SlicedDualImageLayout（glitchFx.js）',
      url: 'https://github.com/codrops/SlicedDualImageLayout',
    },
  ],
  webgl: false,
  interaction: 'none',
  created: '2017-12-24',
  added: '2026-11-04',
  description:
    '黒地に白の「GLITCH」が、ときどき数回だけ小刻みにずれて傾き、かたかたと震える。',
  tags: ['text', 'noise', 'random'],
  tech: ['js'],
})
