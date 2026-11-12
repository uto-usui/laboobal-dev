import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'vhs-rewind',
  title: 'テープの巻き戻し',
  category: 'scroll',
  batch: 'new',
  article: undefined,
  origin:
    '新しく作ったデモ（Jani Kurtti のサイトの巻き戻しの乱れを、clip に書いた仕組みから作り直した）',
  credits: [
    { label: 'Jani Kurtti（Online Studio）', url: 'https://www.janzkak.com' },
    { label: '写真 Unsplash', url: 'https://unsplash.com/license' },
  ],
  webgl: false,
  interaction: 'scroll',
  created: '2026-11-12',
  added: '2026-11-12',
  description:
    'ホームビデオのテープをスクロールで再生し、勢いよく下へ送ると早送り、上へ戻すと VHS の巻き戻しの乱れがかかる。',
  tags: ['scroll', 'noise', 'distortion', 'image'],
  tech: ['svg', 'canvas2d', 'js'],
})
