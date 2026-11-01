import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'scrollmanager',
  title: 'スクロールの視差いろいろ',
  category: 'scroll',
  batch: 'current',
  article: undefined,
  origin: 'laboobal-dev/pages/scrollManager（nuxt2-final）',
  credits: [
    {
      label: 'codrops TileScroll',
      url: 'https://github.com/codrops/TileScroll',
    },
  ],
  webgl: false,
  interaction: 'scroll',
})
