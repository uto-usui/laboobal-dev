import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'three-scale',
  title: '箱から画面いっぱいへ',
  category: 'webgl',
  batch: 'B2',
  article: undefined,
  origin: 'laboobal/docs/canvas/three/scale.md',
  credits: [
    {
      label: 'Codrops',
      url: 'https://tympanus.net/codrops/2019/05/22/creating-grid-to-fullscreen-animations-with-three-js/',
    },
  ],
  webgl: true,
  interaction: 'click',
  created: '2019-10-07',
  added: '2026-11-01',
  description:
    '赤・緑・黄の箱を押すと、板が曲がりながら画面いっぱいまで広がり、少し止まって箱に戻る。',
  tags: ['distortion', 'layout'],
  tech: ['three', 'glsl', 'gsap'],
})
