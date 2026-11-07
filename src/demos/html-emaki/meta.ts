import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'html-emaki',
  title: '透ける絵巻',
  category: 'drag',
  batch: 'new',
  article: undefined,
  origin: '新しく作ったデモ（もとのデモはない）',
  credits: [],
  webgl: true,
  interaction: 'drag',
  created: '2026-11-07',
  added: '2026-11-07',
  description:
    'HTML で描いた長い絵巻を、横に引いて巻き取りながら読む。まだ開いていない巻きには先の絵が裏から透けて見え、市で選んだ灯籠は先の場面に描きこまれる。',
  tags: ['drag', 'scroll', 'physics', 'form', '3d'],
  tech: ['glsl', 'svg', 'css', 'js'],
})
