import { defineDemo } from '../../lib/demos'

export default defineDemo({
  slug: 'particle-photo',
  title: '写真を粒にして次の写真へ運ぶ',
  category: 'webgpu',
  batch: 'new',
  article: undefined,
  origin: '新しく作ったデモ（もとのデモはない）',
  credits: [{ label: '写真 Unsplash', url: 'https://unsplash.com/license' }],
  webgl: false,
  webgpu: true,
  interaction: 'drag',
})
