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
})
