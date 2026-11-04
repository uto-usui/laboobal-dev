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
  created: '2020-10-21',
  added: '2020-10-21',
  description:
    'なめらかに減速するスクロールで、白黒の花の写真や文字が違う速さでずれ、背景の色が移ろう。',
  tags: ['scroll', 'parallax', 'image', 'text'],
  tech: ['locomotive-scroll', 'css'],
  pick: true,
})
